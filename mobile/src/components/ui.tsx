import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import Icon, { IconName } from './Icon';
import { colors, radii, text } from '../theme';

export function Chip({ label, onPress, icon, tone = 'plain', disabled, selected }: {
  label: string; onPress: () => void; icon?: IconName; tone?: 'plain' | 'tag' | 'ink'; disabled?: boolean; selected?: boolean;
}) {
  const shade = selected ? 'tag' : tone;
  const fg = shade === 'ink' ? colors.surface : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      accessibilityState={{ disabled: !!disabled, ...(selected !== undefined ? { selected } : {}) }}
      style={({ pressed }) => [styles.chip, shade === 'tag' && styles.chipTag, shade === 'ink' && styles.chipInk,
        pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
      {icon && <Icon name={icon} size={15} color={fg} />}
      {selected && !icon && <Icon name="check" size={14} color={fg} strokeWidth={2.6} />}
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, badge, disabled, tone = 'plain', style }: {
  icon: IconName; label: string; onPress: () => void; badge?: number; disabled?: boolean;
  tone?: 'plain' | 'ink' | 'wash'; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label}，${badge} 件` : label} disabled={disabled}
      onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.iconButton, tone === 'ink' && styles.iconInk, tone === 'wash' && styles.iconWash,
        pressed && { opacity: 0.7 }, disabled && { opacity: 0.35 }, style]}>
      <Icon name={icon} size={20} color={tone === 'ink' ? colors.surface : colors.ink} />
      {!!badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}
    </Pressable>
  );
}

export function Toggle({ value, onChange, label, disabled }: {
  value: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled} onPress={() => onChange(!value)} hitSlop={8}
      style={[styles.toggle, value && styles.toggleOn, disabled && { opacity: 0.4 }]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

/** Bottom sheet used for product details, comparison, cart and history. */
export function Sheet({ visible, title, onClose, children, footer }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
  }, [visible, rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭面板">
          <View style={styles.scrim} />
        </Pressable>
        <Animated.View style={[styles.sheet, { opacity: rise, transform: [{ translateY }] }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <Text style={text.title} accessibilityRole="header">{title}</Text>
            <IconButton icon="close" label="关闭" onPress={onClose} tone="wash" />
          </View>
          <ScrollView style={styles.sheetBody} contentContainerStyle={{ paddingBottom: 20 }}>{children}</ScrollView>
          {footer && <View style={styles.sheetFooter}>{footer}</View>}
        </Animated.View>
      </View>
    </Modal>
  );
}

export type ToastState = { id: number; message: string; actionLabel?: string; onAction?: () => void; icon?: IconName };

export function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!toast) return;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [toast?.id]);
  if (!toast) return null;
  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return (
    <Animated.View style={[styles.toastLayer, { opacity: appear, transform: [{ translateY }] }]}>
      <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Icon name={toast.icon || 'sparkle'} size={18} color={colors.tag} />
        <Text style={styles.toastText} numberOfLines={2}>{toast.message}</Text>
        {toast.actionLabel && toast.onAction && (
          <Pressable accessibilityRole="button" onPress={() => { toast.onAction?.(); onClose(); }} style={styles.toastAction} hitSlop={6}>
            <Text style={styles.toastActionText}>{toast.actionLabel}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="关闭提示" onPress={onClose} hitSlop={8}>
          <Icon name="close" size={16} color={colors.faint} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.pill, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.surface, maxWidth: 320,
  },
  chipTag: { backgroundColor: colors.tag, borderColor: colors.tagDeep },
  chipInk: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconInk: { backgroundColor: colors.ink },
  iconWash: { backgroundColor: colors.wash },
  badge: {
    position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.tag, borderWidth: 1.5, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.ink },
  toggle: { width: 52, height: 32, borderRadius: 16, padding: 3, justifyContent: 'center', backgroundColor: colors.rule },
  toggleOn: { backgroundColor: colors.ink },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface },
  knobOn: { backgroundColor: colors.tag, alignSelf: 'flex-end' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    width: '100%', maxWidth: 640, maxHeight: '86%', backgroundColor: colors.paper,
    borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingHorizontal: 20,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.rule, marginTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  sheetBody: { flexGrow: 0 },
  sheetFooter: { paddingVertical: 14, borderTopWidth: 1, borderColor: colors.rule, flexDirection: 'row', gap: 10 },
  toastLayer: { position: 'absolute', left: 0, right: 0, bottom: 92, alignItems: 'center', paddingHorizontal: 16, pointerEvents: 'box-none' },
  toast: {
    width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.md, backgroundColor: colors.ink,
  },
  toastText: { flex: 1, color: colors.surface, fontSize: 13, lineHeight: 19 },
  toastAction: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.tag },
  toastActionText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
});
