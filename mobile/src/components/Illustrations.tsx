import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { PriceTag, useReducedMotion } from './Brand';
import { colors } from '../theme';

export type CategoryKind = 'digital' | 'beauty' | 'sports' | 'food';

const BOTTLE = 'M15 21a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5Z';
const SHOE = 'M6 34L7.4 19.2c2.2-1.6 4.4-1.4 6.4.4 1.8 1.6 3.8.4 5.2-3.4l2.6-1.8L30.4 24l8.6 3.4c3.2 1.3 5 3.6 5 6.6Z';

/**
 * Category glyphs drawn for this app: receipt-ink outlines with a single shelf-tag
 * yellow area. `dark` swaps the ink and paper so a glyph can sit on an ink surface.
 */
export function CategoryGlyph({ kind, size = 44, tone = 'light' }: {
  kind: CategoryKind; size?: number; tone?: 'light' | 'dark';
}) {
  const line = tone === 'dark' ? colors.surface : colors.ink;
  const fill = tone === 'dark' ? colors.ink : colors.surface;
  const ink = { stroke: line, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const thin = { ...ink, strokeWidth: 1.8 };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {kind === 'digital' && (
        <>
          <Rect x="14" y="5" width="20" height="38" rx="4" fill={fill} {...ink} />
          <Rect x="17.2" y="10" width="13.6" height="25" rx="1.6" fill={colors.tag} />
          <Path d="M21.5 7.6h5" {...thin} />
          <Circle cx="24" cy="39" r="1.5" fill={line} />
        </>
      )}
      {kind === 'beauty' && (
        <>
          <Rect x="20.5" y="3" width="7" height="8.5" rx="3.5" fill={line} />
          <Rect x="18" y="10.5" width="12" height="5.5" rx="1.2" fill={fill} {...ink} />
          <Path d={BOTTLE} fill={fill} />
          <Path d="M15 29h18v10a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5Z" fill={colors.tag} />
          <Path d={BOTTLE} fill="none" {...ink} />
          <Path d="M20 22.5h8" {...thin} />
        </>
      )}
      {kind === 'sports' && (
        <>
          <Path d={SHOE} fill={fill} {...ink} />
          <Path d="M4 34h40v2.5a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 36.5Z" fill={colors.tag} {...ink} />
          <Path d="M23.8 19.5l2.65-2.45M26.4 22.35l2.7-2.45" {...thin} />
          <Path d="M11 29.5c6.5.9 13.2-.4 19.6-4.4" {...thin} />
        </>
      )}
      {kind === 'food' && (
        <>
          <Path d="M15.5 8.5h17l1.6 4.5H13.9Z" fill={line} />
          <Rect x="10.5" y="13" width="27" height="4.2" rx="1.6" fill={fill} {...ink} />
          <Path d="M12.6 17.2l3 25.8h16.8l3-25.8Z" fill={fill} {...ink} />
          <Path d="M13.7 26.5H34.3L33.15 36.5H14.85Z" fill={colors.tag} {...thin} />
        </>
      )}
    </Svg>
  );
}

/** Viewfinder corner brackets, the brand's framing device. */
export function Brackets({ width, height, color = colors.tag, length = 24, stroke = 4, radius = 8 }: {
  width: number; height: number; color?: string; length?: number; stroke?: number; radius?: number;
}) {
  const h = stroke / 2;
  const [w, ht, l, r] = [width, height, length, radius];
  const d = [
    `M${h} ${l}V${h + r}Q${h} ${h} ${h + r} ${h}H${l}`,
    `M${w - l} ${h}H${w - h - r}Q${w - h} ${h} ${w - h} ${h + r}V${l}`,
    `M${w - h} ${ht - l}V${ht - h - r}Q${w - h} ${ht - h} ${w - h - r} ${ht - h}H${w - l}`,
    `M${l} ${ht - h}H${h + r}Q${h} ${ht - h} ${h} ${ht - h - r}V${ht - l}`,
  ].join('');
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Path d={d} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** A yellow line sweeping through a viewfinder; still when reduced motion is on. */
export function ScanLine({ height, inset = 14 }: { height: number; inset?: number }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sweep, reduced]);
  const translateY = sweep.interpolate({ inputRange: [0, 1], outputRange: [inset, height - inset] });
  return (
    <Animated.View
      style={[styles.scanLine, { left: inset, right: inset, transform: [{ translateY: reduced ? height * 0.55 : translateY }] }]} />
  );
}

/** Hero art: a product caught in the viewfinder and tagged with its price. */
export function SnapArt({ width = 128, height = 116 }: { width?: number; height?: number }) {
  return (
    <View style={{ width, height }} accessible={false}>
      <Brackets width={width} height={height} length={22} stroke={4} radius={7} />
      <View style={styles.centered}>
        <CategoryGlyph kind="sports" size={Math.round(width * 0.62)} tone="dark" />
      </View>
      <ScanLine height={height} />
      <View style={styles.tag}>
        <PriceTag display="¥399 起" size="sm" holeColor={colors.ink} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanLine: { position: 'absolute', top: 0, height: 2, borderRadius: 1, backgroundColor: colors.tag, opacity: 0.75, pointerEvents: 'none' },
  tag: { position: 'absolute', right: -8, bottom: 6, transform: [{ rotate: '-7deg' }] },
});
