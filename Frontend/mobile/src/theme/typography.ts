import { StyleSheet } from 'react-native';
import { colors } from './colors';

export const typography = StyleSheet.create({
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    lineHeight: 34,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
    lineHeight: 28,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.gray[900],
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.gray[700],
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.gray[500],
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[700],
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  caption: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.gray[500],
    lineHeight: 16,
  },
});
