import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import Icon, { IconName } from './Icon';
import { colors, radii } from '../theme';

export default function ActionButton({ icon, label, onPress, disabled, primary, selected, style }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean; primary?: boolean; selected?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const tone = primary ? styles.primary : selected ? styles.selected : null;
  const foreground = primary ? colors.surface : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, tone, pressed && styles.pressed, disabled && styles.disabled, style]}>
      <Icon name={icon} color={foreground} />
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.rule,
    borderRadius: radii.pill, backgroundColor: colors.surface,
  },
  primary: { backgroundColor: colors.ink, borderColor: colors.ink },
  selected: { backgroundColor: colors.tag, borderColor: colors.tagDeep },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 14, fontWeight: '700' },
});
