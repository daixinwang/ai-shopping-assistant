import React from 'react';
import { StyleSheet, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import Icon, { IconName } from './Icon';
import { colors } from '../theme';
export default function ActionButton({ icon, label, onPress, disabled, primary, selected, style }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean; primary?: boolean; selected?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress}
    style={[styles.button, (primary || selected) && styles.primary, disabled && { opacity: 0.45 }, style]}>
    <Icon name={icon} color={primary || selected ? colors.paper : colors.ink} />
    <Text style={[styles.label, (primary || selected) && { color: colors.paper }]}>{label}</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.rule, borderRadius: 3, backgroundColor: colors.surface },
  primary: { backgroundColor: colors.ink, borderColor: colors.ink }, label: { color: colors.ink, fontSize: 12, fontWeight: '700' },
});
