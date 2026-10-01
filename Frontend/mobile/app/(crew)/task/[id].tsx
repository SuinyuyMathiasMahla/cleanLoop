import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { tasksApi, reportsApi, uploadToS3, getApiErrorMessage, AuthExpiredError } from '@/services/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { colors } from '@/theme/colors';

type PhotoItem = { uri: string; key: string; uploaded: boolean; removable?: boolean };

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<any>(null);
  const [reportPhotos, setReportPhotos] = useState<{ reportId: string; uri: string }[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [deletingPhotoKey, setDeletingPhotoKey] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  function getTaskId() {
    return Array.isArray(id) ? id[0] : id;
  }

  const loadTask = useCallback(async () => {
    try {
      const { data } = await tasksApi.getById(getTaskId());
      const t = (data as any).task ?? data;
      setTask(t);

      const linkedPhotos = await Promise.all((t.reportIds ?? []).map(async (reportId: string) => {
        try {
          const { data: reportData } = await reportsApi.getById(reportId);
          const photoUrl = reportData.report?.photoUrl;
          return photoUrl ? { reportId, uri: photoUrl } : null;
        } catch {
          return null;
        }
      }));
      setReportPhotos(linkedPhotos.filter((photo): photo is { reportId: string; uri: string } => photo !== null));

      // Load existing evidence photos from backend
      if ((t.evidencePhotoKeys ?? []).length > 0) {
        try {
          const { data: photoData } = await tasksApi.getEvidencePhotos(getTaskId());
          const serverPhotos: PhotoItem[] = ((photoData as any).photos ?? []).map(
            (p: { url: string; key: string }) => ({ uri: p.url, key: p.key, uploaded: true }),
          );
          setPhotos(serverPhotos);
        } catch {
          // Non-fatal
        }
      }
    } catch (err) {
      if (!(err instanceof AuthExpiredError)) {
        Alert.alert('Error', getApiErrorMessage(err));
      }
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadTask();
      setIsLoading(false);
    })();
  }, [loadTask]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadTask();
    setIsRefreshing(false);
  }

  async function uploadEvidencePhoto(uri: string, presigned?: { url: string; key: string }) {
    const contentType = 'image/jpeg';
    let uploadUrl = presigned?.url;
    let uploadKey = presigned?.key;
    if (!uploadUrl || !uploadKey) {
      const { data } = await tasksApi.getEvidenceUploadUrl(getTaskId(), contentType, `evidence_${Date.now()}.jpg`);
      uploadUrl = data.url;
      uploadKey = data.key;
    }
    await uploadToS3(uploadUrl, uri, contentType);
    setPhotos((current) => current.some(photo => photo.key === uploadKey)
      ? current
      : [...current, { uri, key: uploadKey!, uploaded: true, removable: true }]);
  }

  async function handleDeleteEvidencePhoto(photo: PhotoItem) {
    if (!photo.removable || deletingPhotoKey) return;
    setDeletingPhotoKey(photo.key);
    try {
      await tasksApi.deleteEvidencePhoto(getTaskId(), photo.key);
      setPhotos((current) => current.filter((item) => item.key !== photo.key));
    } catch (err) {
      if (!(err instanceof AuthExpiredError)) {
        Alert.alert('Could Not Delete Photo', getApiErrorMessage(err));
      }
    } finally {
      setDeletingPhotoKey(null);
    }
  }

  // ── Add evidence photo ──────────────────────────────────────────────────
  async function handleAddPhoto() {
    try {
      let granted = cameraPermission?.granted ?? false;
      if (!granted) {
        const permission = await requestCameraPermission();
        granted = permission.granted;
      }
      if (!granted) {
        Alert.alert('Permission Denied', 'Camera access is required to add evidence photos.');
        return;
      }
      setIsCameraReady(false);
      setIsCameraOpen(true);
    } catch (err) {
      if (!(err instanceof AuthExpiredError)) {
        Alert.alert('Error', getApiErrorMessage(err));
      }
    }
  }

  async function handleCaptureEvidence() {
    if (!cameraRef.current || !isCameraReady || isUploading) return;
    setIsUploading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
      if (!photo?.uri) return;
      await uploadEvidencePhoto(photo.uri);
      setIsCameraOpen(false);
    } catch (err) {
      Alert.alert('Upload Failed', getApiErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  }

  // ── Mark task complete ──────────────────────────────────────────────────
  async function handleMarkComplete() {
    const uploadedKeys = photos.filter(p => p.uploaded).map(p => p.key);

    // Frontend guard mirrors backend requirement
    if (uploadedKeys.length === 0) {
      Alert.alert(
        'Evidence Required',
        'You must add at least one evidence photo before marking this task as complete.',
      );
      return;
    }

    setIsCompleting(true);
    try {
      await tasksApi.updateStatus(getTaskId(), 'completed', uploadedKeys);
      // Only update local state AFTER the API confirms success
      setTask((prev: any) =>
        prev ? { ...prev, status: 'completed', evidencePhotoKeys: uploadedKeys } : prev,
      );
      Alert.alert('Task Complete', 'This task has been marked as completed.');
    } catch (err) {
      if (!(err instanceof AuthExpiredError)) {
        Alert.alert('Could Not Complete Task', getApiErrorMessage(err));
      }
    } finally {
      setIsCompleting(false);
    }
  }

  // ── Mark in progress ────────────────────────────────────────────────────
  async function handleStartTask() {
    try {
      await tasksApi.updateStatus(getTaskId(), 'in_progress');
      setTask((prev: any) => prev ? { ...prev, status: 'in_progress' } : prev);
    } catch (err) {
      if (!(err instanceof AuthExpiredError)) {
        Alert.alert('Error', getApiErrorMessage(err));
      }
    }
  }

  if (isLoading) return <LoadingSpinner fullScreen message="Loading task..." />;
  if (!task) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.gray[500]} />
          <Text style={styles.errorText}>Task not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';
  const canAct = !isCompleted && !isCancelled;
  const uploadedCount = photos.filter(p => p.uploaded).length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{task.title ?? 'Task Detail'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {/* Status badge */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, getStatusBg(task.status)]}>
            <Ionicons name={getStatusIcon(task.status)} size={14} color={getStatusColor(task.status)} />
            <Text style={[styles.statusText, { color: getStatusColor(task.status) }]}>
              {getStatusLabel(task.status)}
            </Text>
          </View>
          {task.dueAt ? (
            <Text style={styles.dueText}>
              Due {new Date(task.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          ) : null}
        </View>

        {/* Task info card */}
        <View style={styles.card}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          {task.description ? (
            <Text style={styles.taskDescription}>{task.description}</Text>
          ) : null}
          {reportPhotos.length > 0 && (
            <View style={styles.reportPhotosSection}>
              <Text style={styles.reportPhotosLabel}>Reported photo</Text>
              <View style={styles.reportPhotosRow}>
                {reportPhotos.map((photo) => (
                  <Image
                    key={photo.reportId}
                    source={{ uri: photo.uri }}
                    style={styles.reportPhoto}
                    resizeMode="cover"
                    accessibilityLabel="Photo submitted with the linked report"
                  />
                ))}
              </View>
            </View>
          )}
          <View style={styles.metaGrid}>
            <View style={styles.metaHighlights}>
              <MetaRow icon="calendar-outline" label="Scheduled" value={
                new Date(task.scheduledAt).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })
              } />
              {(task.reportIds ?? []).length > 0 ? (
                <MetaRow icon="document-text-outline" label="Reports" value={`${task.reportIds.length} linked`} />
              ) : null}
            </View>
            {(task.crewIds ?? []).length > 0 ? (
              <MetaRow icon="people-outline" label="Crew" value={`${task.crewIds.length} member${task.crewIds.length !== 1 ? 's' : ''}`} />
            ) : null}
            {task.notes ? (
              <MetaRow icon="reader-outline" label="Notes" value={task.notes} />
            ) : null}
          </View>
        </View>

        {/* Evidence photos */}
        <View style={styles.photoSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Evidence Photos</Text>
            {uploadedCount > 0 ? (
              <Text style={styles.sectionCount}>{uploadedCount} uploaded</Text>
            ) : null}
          </View>

          {photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {photos.map((photo, i) => (
                <View key={photo.key ?? i} style={styles.photoThumb}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
                  {canAct && photo.removable ? (
                    <TouchableOpacity
                      style={styles.photoDelete}
                      onPress={() => handleDeleteEvidencePhoto(photo)}
                      disabled={deletingPhotoKey === photo.key}
                      accessibilityLabel="Delete snapped evidence photo"
                    >
                      {deletingPhotoKey === photo.key
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Ionicons name="close" size={16} color={colors.white} />}
                    </TouchableOpacity>
                  ) : null}
                  {photo.uploaded ? (
                    <View style={styles.photoCheck}>
                      <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.photoEmpty}>
              <Ionicons name="camera-outline" size={32} color={colors.gray[300]} />
              <Text style={styles.photoEmptyText}>No photos yet</Text>
              <Text style={styles.photoEmptySub}>
                At least one photo is required to complete this task
              </Text>
            </View>
          )}

          {canAct ? (
            <TouchableOpacity
              style={[styles.addPhotoBtn, isUploading && styles.btnDisabled]}
              onPress={handleAddPhoto}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="camera" size={18} color={colors.primary} />
              )}
              <Text style={styles.addPhotoBtnText}>
                {isUploading ? 'Uploading…' : 'Add Photo'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Action buttons */}
        {canAct ? (
          <View style={styles.actions}>
            {task.status === 'assigned' ? (
              <TouchableOpacity style={styles.startBtn} onPress={handleStartTask} activeOpacity={0.8}>
                <Ionicons name="play-circle-outline" size={20} color={colors.white} />
                <Text style={styles.startBtnText}>Start Task</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.completeBtn, isCompleting && styles.btnDisabled]}
              onPress={handleMarkComplete}
              disabled={isCompleting}
              activeOpacity={0.8}
            >
              {isCompleting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              )}
              <Text style={styles.completeBtnText}>
                {isCompleting ? 'Saving…' : 'Mark Complete'}
              </Text>
            </TouchableOpacity>

            {uploadedCount === 0 ? (
              <Text style={styles.completeHint}>
                Add at least one evidence photo to mark this task complete
              </Text>
            ) : null}
          </View>
        ) : null}

        {isCompleted ? (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
            <Text style={styles.completedBannerText}>This task has been completed</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={isCameraOpen}
        animationType="slide"
        onRequestClose={() => { if (!isUploading) setIsCameraOpen(false); }}
      >
        <View style={styles.cameraModal}>
          <CameraView
            ref={cameraRef}
            style={styles.liveCamera}
            facing="back"
            mode="picture"
            onCameraReady={() => setIsCameraReady(true)}
          >
            <View style={styles.cameraTopBar}>
              <Text style={styles.cameraTitle}>Capture evidence</Text>
              <TouchableOpacity
                style={styles.cameraCloseButton}
                onPress={() => setIsCameraOpen(false)}
                disabled={isUploading}
                accessibilityLabel="Close camera"
              >
                <Ionicons name="close" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.cameraBottomBar}>
              <TouchableOpacity
                style={[styles.shutterButton, (!isCameraReady || isUploading) && styles.btnDisabled]}
                onPress={handleCaptureEvidence}
                disabled={!isCameraReady || isUploading}
                accessibilityLabel="Take evidence photo"
              >
                {isUploading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <View style={styles.shutterInner} />}
              </TouchableOpacity>
              <Text style={styles.cameraHint}>
                {isUploading ? 'Uploading evidence…' : 'Take a clear photo of the completed work'}
              </Text>
            </View>
          </CameraView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={16} color={colors.gray[500]} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    assigned: 'Assigned', scheduled: 'Scheduled',
    in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

function getStatusColor(status: string) {
  if (status === 'completed') return '#16a34a';
  if (status === 'in_progress') return colors.primary;
  if (status === 'cancelled') return '#dc2626';
  if (status === 'assigned') return '#0284c7';
  return colors.gray[700];
}

function getStatusBg(status: string) {
  if (status === 'completed') return { backgroundColor: '#dcfce7' };
  if (status === 'in_progress') return { backgroundColor: colors.primaryLight };
  if (status === 'cancelled') return { backgroundColor: '#fee2e2' };
  if (status === 'assigned') return { backgroundColor: '#e0f2fe' };
  return { backgroundColor: colors.gray[100] };
}

function getStatusIcon(status: string): any {
  if (status === 'completed') return 'checkmark-circle';
  if (status === 'in_progress') return 'refresh-circle';
  if (status === 'cancelled') return 'close-circle';
  if (status === 'assigned') return 'person-circle-outline';
  return 'time-outline';
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary },
  navBack: { width: 40, alignItems: 'flex-start' },
  navTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.white, textAlign: 'center' },
  cameraModal: { flex: 1, backgroundColor: '#000' },
  liveCamera: { flex: 1, justifyContent: 'space-between' },
  cameraTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 20 },
  cameraTitle: { color: colors.white, fontSize: 17, fontWeight: '700' },
  cameraCloseButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  cameraBottomBar: { alignItems: 'center', paddingBottom: 40, gap: 12 },
  shutterButton: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white },
  cameraHint: { color: colors.white, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '700' },
  dueText: { fontSize: 12, color: colors.gray[500], fontWeight: '500' },
  card: { backgroundColor: colors.white, borderRadius: 4, padding: 16, marginHorizontal: -12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  taskTitle: { fontSize: 20, fontWeight: '800', color: colors.gray[900], marginBottom: 6 },
  taskDescription: { fontSize: 14, color: colors.gray[700], lineHeight: 20, marginBottom: 12 },
  reportPhotosSection: { marginBottom: 12 },
  reportPhotosLabel: { fontSize: 12, fontWeight: '700', color: colors.gray[500], marginBottom: 8 },
  reportPhotosRow: { gap: 8 },
  reportPhoto: { width: '100%', aspectRatio: 1.5, borderRadius: 2, backgroundColor: colors.gray[100] },
  metaGrid: { gap: 10, marginTop: 4 },
  metaHighlights: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaRow: { flex: 1, flexDirection: 'row', gap: 8, minWidth: 0 },
  metaLabel: { fontSize: 11, fontWeight: '600', color: colors.gray[500], textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 14, color: colors.gray[900], marginTop: 1 },
  photoSection: { backgroundColor: colors.white, borderRadius: 4, padding: 16, marginHorizontal: -12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.gray[900] },
  sectionCount: { fontSize: 12, fontWeight: '600', color: colors.primary },
  photosRow: { flexDirection: 'row', gap: 10, paddingBottom: 4 },
  photoThumb: { width: 90, height: 90, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photoImage: { width: '100%', height: '100%' },
  photoDelete: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  photoCheck: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#fff', borderRadius: 10 },
  photoEmpty: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  photoEmptyText: { fontSize: 14, fontWeight: '600', color: colors.gray[500] },
  photoEmptySub: { fontSize: 12, color: colors.gray[500], textAlign: 'center' },
  addPhotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.primaryLight },
  addPhotoBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  actions: { gap: 10 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0284c7', borderRadius: 12, paddingVertical: 14 },
  startBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14 },
  completeBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  btnDisabled: { opacity: 0.5 },
  completeHint: { fontSize: 12, color: colors.gray[500], textAlign: 'center', paddingHorizontal: 16 },
  completedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#dcfce7', borderRadius: 12, paddingVertical: 14 },
  completedBannerText: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 16, fontWeight: '600', color: colors.gray[700] },
  backButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  backButtonText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});