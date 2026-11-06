import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors, fonts } from '../theme';

/** Brand mark: a hang tag with a viewfinder, the same geometry as mobile/assets. */
export function LogoMark({ size = 28, tagColor = colors.tag, holeColor = 'transparent' }: {
  size?: number; tagColor?: string; holeColor?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="2.395 -1.274 100 100">
      <G transform="rotate(-10 50 50)">
        <Path fill={tagColor} fillRule="evenodd"
          d="M37.668 24L77 24A7 7 0 0 1 84 31L84 69A7 7 0 0 1 77 76L37.668 76A7 7 0 0 1 31.912 72.984L18.758 53.984A7 7 0 0 1 18.758 46.016L31.912 27.016A7 7 0 0 1 37.668 24ZM23.5 50a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0Z" />
        {holeColor !== 'transparent' && <Circle cx="29" cy="50" r="5.5" fill={holeColor} />}
        <Path fill="none" stroke={colors.ink} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round"
          d="M44 44L44 35L53 35M74 44L74 35L65 35M74 56L74 65L65 65M44 56L44 65L53 65" />
        <Circle cx="59" cy="50" r="4" fill={colors.ink} />
      </G>
    </Svg>
  );
}

const PRICE_RE = /^\s*(¥)?\s*([\d.,]+(?:\s*[–-]\s*¥?\s*[\d.,]+)?)\s*(.*)$/;

export function splitPrice(display: string) {
  const match = PRICE_RE.exec(display || '');
  if (!match) return { symbol: '', amount: display, suffix: '' };
  return { symbol: match[1] || '¥', amount: match[2].replace(/\s+/g, ''), suffix: match[3] };
}

const TAG_SIZES = { sm: { height: 24, amount: 13 }, md: { height: 30, amount: 16 }, lg: { height: 40, amount: 22 } };

/** Shelf-tag price label: the one place the yellow accent carries information. */
export function PriceTag({ display, size = 'md', holeColor = colors.surface }: {
  display: string; size?: keyof typeof TAG_SIZES; holeColor?: string;
}) {
  const [width, setWidth] = useState(0);
  const { height, amount: amountSize } = TAG_SIZES[size];
  const notch = height * 0.42;
  const r = 4;
  const { symbol, amount, suffix } = splitPrice(display);
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.ceil(event.nativeEvent.layout.width));
  const path = `M${notch} 0H${width - r}Q${width} 0 ${width} ${r}V${height - r}Q${width} ${height} ${width - r} ${height}H${notch}L0 ${height / 2}Z`;
  return (
    <View onLayout={onLayout} accessible accessibilityLabel={`价格 ${display}`}
      style={[styles.tag, { height, paddingLeft: notch + 4 }]}>
      {width > 0 && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path d={path} fill={colors.tag} />
          <Circle cx={notch * 0.62} cy={height / 2} r={height * 0.09} fill={holeColor} />
        </Svg>
      )}
      <Text style={[styles.symbol, { fontSize: amountSize * 0.62 }]}>{symbol}</Text>
      <Text style={[styles.amount, { fontSize: amountSize }]}>{amount}</Text>
      {!!suffix && <Text style={[styles.suffix, { fontSize: amountSize * 0.62 }]}> {suffix}</Text>}
    </View>
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (mounted) setReduced(value); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  return reduced;
}

/** Viewfinder brackets that breathe while the assistant is working. */
export function ScanLoader({ size = 18, color = colors.ink }: { size?: number; color?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible={false}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round">
          <Path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
        </Svg>
      </Animated.View>
      <View style={[styles.scanDot, { backgroundColor: colors.tag, borderColor: color }]} />
    </View>
  );
}

/** Inline caret appended to an answer while it is being written. */
export function InlineCaret() {
  return <Text style={styles.caret}> ▍</Text>;
}

const styles = StyleSheet.create({
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingRight: 9 },
  symbol: { fontFamily: fonts.mono, fontWeight: '700', color: colors.ink, marginRight: 1 },
  amount: { fontFamily: fonts.mono, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  suffix: { fontWeight: '700', color: colors.ink },
  scanDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  caret: { color: colors.tagDeep, fontWeight: '900' },
});
