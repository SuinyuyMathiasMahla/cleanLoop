import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';

function AuthGate() {
  const { user, isLoading, loadStoredAuth } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup    = segments[0] === 'auth';
    const inGuestGroup   = segments[0] === '(guest)';
    const inCitizenGroup = segments[0] === '(citizen)';
    const inCrewGroup    = segments[0] === '(crew)';

    if (!user) {
      if (!inGuestGroup && !inAuthGroup) router.replace('/(guest)');
      return;
    }

    // Normalize to lowercase — Cognito returns 'CREW', 'CITIZEN', 'ADMIN'
    const role = user.role?.toLowerCase();

    if (role === 'admin') {
      if (!inGuestGroup && !inAuthGroup) router.replace('/(guest)');
      return;
    }

    if (role === 'citizen' && !inCitizenGroup) {
      router.replace('/(citizen)/tabs');
      return;
    }

    if (role === 'crew' && !inCrewGroup) {
      router.replace('/(crew)/tabs');
      return;
    }
  }, [user, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(guest)" />
        <Stack.Screen name="(citizen)" />
        <Stack.Screen name="(crew)" />
        <Stack.Screen name="auth" />
      </Stack>
    </SafeAreaProvider>
  );
}