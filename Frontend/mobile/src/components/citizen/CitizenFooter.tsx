import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DARK  = '#0f1f1a';
const GREEN = '#1a7a5e';
const year  = new Date().getFullYear();

const socials: { name: 'logo-facebook' | 'logo-twitter' | 'logo-instagram' | 'logo-linkedin' | 'logo-youtube'; url: string }[] = [
  { name: 'logo-facebook',  url: 'https://facebook.com' },
  { name: 'logo-twitter',   url: 'https://twitter.com' },
  { name: 'logo-instagram', url: 'https://instagram.com' },
  { name: 'logo-linkedin',  url: 'https://linkedin.com' },
  { name: 'logo-youtube',   url: 'https://youtube.com' },
];

const platform = ['My Reports', 'Report Waste', 'Track a Report', 'Notifications', 'My Profile'];
const support  = ['Help Center', 'How It Works', 'Report an Issue', 'Feature Requests', 'System Status'];

export function CitizenFooter() {
  return (
    <View style={styles.footer}>

      <View style={styles.brandRow}>
        <View style={styles.logoCircle}>
          <Ionicons name="leaf" size={18} color="#fff" />
        </View>
        <Text style={styles.brandName}>CleanLoop</Text>
      </View>

      <Text style={styles.tagline}>
        Empowering communities with smart waste management. Connecting citizens, crew, and administrators for a cleaner, greener future.
      </Text>

      <View style={styles.socialRow}>
        {socials.map((s) => (
          <TouchableOpacity key={s.name} style={styles.socialBtn} onPress={() => Linking.openURL(s.url)} activeOpacity={0.7}>
            <Ionicons name={s.name} size={15} color="#d1d5db" />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.linksGrid}>
        <View style={styles.linkCol}>
          <Text style={styles.linkHeading}>Platform</Text>
          {platform.map((item) => <Text key={item} style={styles.linkItem}>{item}</Text>)}
        </View>
        <View style={styles.linkCol}>
          <Text style={styles.linkHeading}>Support</Text>
          {support.map((item) => <Text key={item} style={styles.linkItem}>{item}</Text>)}
        </View>
      </View>

      <View style={styles.contactBlock}>
        <Text style={styles.linkHeading}>Contact Us</Text>
        <View style={styles.contactRow}>
          <Ionicons name="location-outline" size={13} color={GREEN} />
          <Text style={styles.contactText}>123 Green Street, Eco City, CA 90210</Text>
        </View>
        <View style={styles.contactRow}>
          <Ionicons name="call-outline" size={13} color={GREEN} />
          <Text style={[styles.contactText, styles.contactLink]} onPress={() => Linking.openURL('tel:+15551234567')}>
            +1 (555) 123-4567
          </Text>
        </View>
        <View style={styles.contactRow}>
          <Ionicons name="mail-outline" size={13} color={GREEN} />
          <Text style={[styles.contactText, styles.contactLink]} onPress={() => Linking.openURL('mailto:admin@cleanloop.io')}>
            admin@cleanloop.io
          </Text>
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.bottomText}>© {year} CleanLoop. All rights reserved. Built for a cleaner planet.</Text>
        <View style={styles.bottomLinks}>
          <Text style={styles.bottomLink}>Privacy Policy</Text>
          <Text style={styles.bottomDot}>·</Text>
          <Text style={styles.bottomLink}>Terms of Service</Text>
          <Text style={styles.bottomDot}>·</Text>
          <Text style={styles.bottomLink}>Cookies</Text>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: DARK,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  logoCircle: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  brandName:  { fontSize: 20, fontWeight: '800', color: '#fff' },
  tagline:    { fontSize: 12, color: '#9ca3af', lineHeight: 18, marginBottom: 18 },
  socialRow:  { flexDirection: 'row', gap: 10, marginBottom: 26 },
  socialBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  linksGrid:  { flexDirection: 'row', gap: 24, marginBottom: 26 },
  linkCol:    { flex: 1 },
  linkHeading: {
    fontSize: 11, fontWeight: '700', color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  linkItem:     { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  contactBlock: { marginBottom: 26 },
  contactRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  contactText:  { fontSize: 12, color: '#9ca3af', flex: 1 },
  contactLink:  { color: '#6ee7b7' },
  bottomBar: {
    borderTopWidth: 1, borderTopColor: '#1f2937',
    paddingTop: 16, gap: 8,
  },
  bottomText:  { fontSize: 11, color: '#6b7280', textAlign: 'center' },
  bottomLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  bottomLink:  { fontSize: 11, color: '#6b7280' },
  bottomDot:   { fontSize: 11, color: '#374151' },
});