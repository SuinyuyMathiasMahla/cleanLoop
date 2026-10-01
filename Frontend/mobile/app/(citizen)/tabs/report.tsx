import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useReportStore } from '@/store/reportStore';
import { getCurrentLocation } from '@/services/location';
import { colors } from '@/theme/colors';
import { useAuthStore } from '@/store/authStore';

type ReportType = 'overflow_bin' | 'illegal_dumping';

const DARK_BG   = '#0d1f1a';
const GREEN     = '#1a7a5e';
const GREEN2    = '#00e5a0';
const CARD_BG   = '#111f1a';

export default function CitizenReportScreen() {
  const router = useRouter();
  const { submitReport, submitGuestReport, isSubmitting } = useReportStore();
  const { user } = useAuthStore();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [photo, setPhoto] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('overflow_bin');
  const [description, setDescription] = useState('');
  const [postPublic, setPostPublic] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  useEffect(() => { fetchLocation(); }, []);

  async function fetchLocation() {
    setLocationLoading(true);
    setLocationError('');
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get location');
    } finally {
      setLocationLoading(false);
    }
  }

  async function handleCapture() {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (result?.uri) setPhoto(result.uri);
    } catch {
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  }

  async function handleSubmit() {
    if (!photo) {
      Alert.alert('Photo Required', 'Please take a photo of the waste issue.');
      return;
    }
    if (!location) {
      Alert.alert('Location Required', 'We need your location to file this report.');
      return;
    }
    try {
      const payload = {
        type: reportType,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        description: description.trim() || undefined,
        photo,
      };
      if (user) {
        await submitReport(payload);
      } else {
        await submitGuestReport(payload);
      }
      Alert.alert('Report Submitted', 'Thank you! Your report has been received.', [
        { text: 'OK', onPress: () => router.replace('/(citizen)/tabs/my-reports') },
      ]);
    } catch (err) {
      Alert.alert('Submission Failed', err instanceof Error ? err.message : 'Could not submit report.');
    }
  }

  if (!permission) return <LoadingSpinner fullScreen />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={56} color="#444" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionSubtitle}>CleanLoop needs camera access to capture waste reports.</Text>
          <Button title="Grant Camera Access" onPress={requestPermission} style={styles.permissionBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── ANTI-FRAUD BANNER ── */}
        <View style={styles.fraudBanner}>
          <Ionicons name="shield-checkmark" size={14} color={GREEN2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fraudTitle}>ANTI-FRAUD PROTECTION ACTIVE</Text>
            <Text style={styles.fraudSub}>Live Camera Capture Only — photo gallery uploads are disabled to ensure real-time reporting accuracy and instant location tagging.</Text>
          </View>
        </View>

        {/* ── CAMERA ── */}
        <View style={styles.cameraWrapper}>
          {photo ? (
            <>
              <Image source={{ uri: photo }} style={styles.camera} />
              <TouchableOpacity style={styles.retakeBtn} onPress={() => { setPhoto(null); setCameraReady(false); }}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>
            </>
          ) : (
            <CameraView ref={cameraRef} style={styles.camera} facing="back" onCameraReady={() => setCameraReady(true)}>
              {/* Top bar inside camera */}
              <View style={styles.camTopBar}>
                <View style={styles.camPill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.camPillText}>LIVE FEED</Text>
                </View>
                <View style={styles.camPill}>
                  <Text style={styles.camPillText}>60 FPS</Text>
                </View>
                <View style={{ flex: 1 }} />
              </View>

              {/* Corner brackets */}
              <View style={styles.cameraOverlay}>
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                {/* Center crosshair */}
                <View style={styles.crossH} />
                <View style={styles.crossV} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
              </View>

              {/* Horizon label */}
              <View style={styles.horizonRow}>
                <Text style={styles.horizonText}>⊕  HORIZON 0.0° LEVELED</Text>
              </View>

              <View style={styles.detectionRow}>
                <Text style={styles.detectionTitle}>Waste report photo</Text>
                {location && (
                  <View style={styles.gpsRow}>
                    <Ionicons name="location" size={11} color={GREEN2} />
                    <Text style={styles.gpsText}>
                      GPS: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </Text>
                  </View>
                )}
                {locationLoading && (
                  <View style={styles.gpsRow}>
                    <Ionicons name="location-outline" size={11} color="#888" />
                    <Text style={[styles.gpsText, { color: '#888' }]}>Acquiring GPS lock...</Text>
                  </View>
                )}
              </View>

              {/* Bottom bar: capture + grid + GPS sync */}
              <View style={styles.camBottomBar}>
                <View style={styles.camBottomAction}>
                  <Ionicons name="grid-outline" size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.camBottomLabel}>Grid</Text>
                </View>
                <TouchableOpacity style={[styles.captureBtn, !cameraReady && styles.captureBtnDisabled]} onPress={handleCapture} activeOpacity={0.85} disabled={!cameraReady}>
                  <View style={styles.captureBtnRing}>
                    <View style={styles.captureBtnInner} />
                  </View>
                </TouchableOpacity>
                <View style={styles.camBottomAction}>
                  <Ionicons name="navigate" size={20} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.camBottomLabel}>GPS Sync</Text>
                </View>
              </View>
            </CameraView>
          )}
        </View>

        {/* ── CLASSIFICATION ── */}
        <View style={styles.classSection}>
          <View style={styles.classHeader}>
            <Text style={styles.classTitle}>CLASSIFICATION</Text>
            <Text style={styles.classAuto}>Choose one</Text>
          </View>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeChip, reportType === 'overflow_bin' && styles.typeChipSelected]}
              onPress={() => setReportType('overflow_bin')}
              activeOpacity={0.8}
            >
              <Ionicons name="trash" size={13} color={reportType === 'overflow_bin' ? '#fff' : '#666'} />
              <Text style={[styles.typeChipText, reportType === 'overflow_bin' && styles.typeChipTextSelected]}>
                Overflowing Public Bin
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeChip, reportType === 'illegal_dumping' && styles.typeChipSelected]}
              onPress={() => setReportType('illegal_dumping')}
              activeOpacity={0.8}
            >
              <Ionicons name="warning" size={13} color={reportType === 'illegal_dumping' ? '#fff' : '#b45309'} />
              <Text style={[styles.typeChipText, reportType === 'illegal_dumping' && styles.typeChipTextSelected]}>
                Illegal Dumping Site
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── POST PUBLIC TOGGLE ── */}
        <View style={styles.toggleRow}>
          <Ionicons name="earth" size={16} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Post anonymously to Public Feed</Text>
            <Text style={styles.toggleSub}>Visible to sanitation crews and neighbours</Text>
          </View>
          <Switch
            value={postPublic}
            onValueChange={setPostPublic}
            trackColor={{ false: '#333', true: GREEN }}
            thumbColor="#fff"
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>

        {/* ── DESCRIPTION ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description (optional)</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* ── SUBMIT ── */}
        <View style={styles.submitSection}>
          <Button
            title="Submit Report"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!photo || !location}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: DARK_BG },
  scroll: { flexGrow: 1, paddingBottom: 40 },

  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionTitle:    { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 20, marginBottom: 10, textAlign: 'center' },
  permissionSubtitle: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permissionBtn:      { width: '80%' },

  fraudBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#0a1f18', borderBottomWidth: 1, borderBottomColor: '#1a3a2a',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  fraudTitle: { fontSize: 11, fontWeight: '800', color: GREEN2, letterSpacing: 0.5, marginBottom: 2 },
  fraudSub:   { fontSize: 11, color: '#6b9e8a', lineHeight: 16 },

  cameraWrapper: { height: 420, backgroundColor: '#000' },
  camera:        { width: '100%', height: '100%' },

  camTopBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8,
  },
  camPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  camPillText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  liveDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff4444' },

  cameraOverlay: { flex: 1, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  cornerTL: { position: 'absolute', top: 0, left: 20, width: 32, height: 32, borderTopWidth: 2, borderLeftWidth: 2, borderColor: GREEN2 },
  cornerTR: { position: 'absolute', top: 0, right: 20, width: 32, height: 32, borderTopWidth: 2, borderRightWidth: 2, borderColor: GREEN2 },
  cornerBL: { position: 'absolute', bottom: 0, left: 20, width: 32, height: 32, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: GREEN2 },
  cornerBR: { position: 'absolute', bottom: 0, right: 20, width: 32, height: 32, borderBottomWidth: 2, borderRightWidth: 2, borderColor: GREEN2 },
  crossH:   { position: 'absolute', width: 20, height: 1, backgroundColor: GREEN2, opacity: 0.8 },
  crossV:   { position: 'absolute', width: 1, height: 20, backgroundColor: GREEN2, opacity: 0.8 },

  horizonRow: { alignItems: 'center', paddingBottom: 6 },
  horizonText: { fontSize: 10, color: GREEN2, letterSpacing: 0.8, opacity: 0.8 },

  detectionRow: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  detectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 5 },
  gpsRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gpsText:   { fontSize: 11, color: GREEN2 },

  camBottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 30, paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  camBottomAction: { alignItems: 'center', gap: 4, width: 56 },
  camBottomLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  captureBtn:      { alignItems: 'center', justifyContent: 'center' },
  captureBtnDisabled: { opacity: 0.45 },
  captureBtnRing: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 3, borderColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(26,122,94,0.3)',
  },
  captureBtnInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: GREEN },

  retakeBtn: {
    position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6,
  },
  retakeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  classSection: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 },
  classHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  classTitle:   { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 0.8 },
  classAuto:    { fontSize: 11, fontWeight: '600', color: GREEN2 },
  typeRow:      { flexDirection: 'row', gap: 10 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: CARD_BG, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#2a3a34',
  },
  typeChipSelected: { backgroundColor: GREEN, borderColor: GREEN },
  typeChipText:     { fontSize: 12, fontWeight: '600', color: '#9ca3af', flex: 1 },
  typeChipTextSelected: { color: '#fff' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: CARD_BG, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2a3a34',
  },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 2 },
  toggleSub:   { fontSize: 11, color: '#6b7c76' },

  section:      { paddingHorizontal: 16, marginTop: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  textArea: {
    backgroundColor: CARD_BG, borderRadius: 10, borderWidth: 1.5,
    borderColor: '#2a3a34', paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#fff', minHeight: 90,
  },
  submitSection: { paddingHorizontal: 16, marginTop: 24 },
});