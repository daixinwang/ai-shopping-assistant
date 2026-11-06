import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import ActionButton from '../components/ActionButton';
import { ScanLoader } from '../components/Brand';
import { Brackets, CategoryGlyph, ScanLine } from '../components/Illustrations';
import { IconButton } from '../components/ui';
import { ImageSource, pickImage } from '../utils/pickImage';
import { colors, fonts, radii } from '../theme';

type Props = {
  route: RouteProp<RootStackParamList, 'Camera'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'>;
};

const TIPS = [
  '一次只拍一件，让它占满大半个框',
  '光线充足，避开反光和杂乱的背景',
  '拍到 logo 或标签，识别会更准',
];
const INSET = 16;

export default function CameraScreen({ route, navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const frameWidth = Math.min(width - 48, 340);
  const frameHeight = Math.min(Math.round(frameWidth * 1.05), Math.max(220, height - 420));
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const choose = async (source: ImageSource) => {
    setError('');
    try {
      const image = await pickImage(source, () => setReading(true));
      if (image) navigation.navigate('Assistant', { imageBase64: image, newChat: route.params?.newChat });
    } catch (err: any) {
      setError(err?.message || '图片读取失败，请重试。');
    } finally {
      setReading(false);
    }
  };

  const innerWidth = frameWidth - INSET * 2;
  const innerHeight = frameHeight - INSET * 2;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.header}>
        <IconButton icon="back" label="返回" onPress={() => navigation.goBack()} />
        <Text style={s.title} accessibilityRole="header">拍照找同款</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.frame, { width: frameWidth, height: frameHeight }]} accessible accessibilityLabel="取景框：把商品放进框里">
          {[1, 2].map(i => <View key={`v${i}`} style={[s.gridV, { left: (frameWidth * i) / 3 }]} />)}
          {[1, 2].map(i => <View key={`h${i}`} style={[s.gridH, { top: (frameHeight * i) / 3 }]} />)}
          <View style={s.center}>
            {reading ? (
              <>
                <ScanLoader size={34} color={colors.surface} />
                <Text style={s.frameText}>正在读取图片…</Text>
              </>
            ) : (
              <>
                <View style={{ opacity: 0.55 }}>
                  <CategoryGlyph kind="sports" size={Math.round(frameWidth * 0.4)} tone="dark" />
                </View>
                <Text style={s.frameText}>把商品放进框里</Text>
              </>
            )}
          </View>
          <View style={[s.inner, { width: innerWidth, height: innerHeight }]}>
            <Brackets width={innerWidth} height={innerHeight} length={34} stroke={5} radius={12} />
            {!reading && <ScanLine height={innerHeight} inset={10} />}
          </View>
        </View>

        <View style={[s.tips, { width: frameWidth }]}>
          {TIPS.map((tip, index) => (
            <View key={tip} style={s.tip}>
              <Text style={s.tipIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={s.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
        {!!error && <Text style={[s.error, { width: frameWidth }]} accessibilityRole="alert">{error}</Text>}
      </ScrollView>
      <View style={s.actions}>
        <ActionButton icon="camera" label="拍照" primary disabled={reading} onPress={() => void choose('camera')} style={{ flex: 1 }} />
        <ActionButton icon="image" label="从相册选" disabled={reading} onPress={() => void choose('library')} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.rule,
  },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  body: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  frame: { borderRadius: radii.lg, backgroundColor: colors.ink, overflow: 'hidden' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 14 },
  inner: { position: 'absolute', left: INSET, top: INSET, pointerEvents: 'none' },
  frameText: { color: colors.mutedOnInk, fontSize: 13, fontWeight: '600' },
  tips: { marginTop: 22, gap: 12 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipIndex: {
    fontFamily: fonts.mono, fontSize: 12, fontWeight: '800', color: colors.ink, backgroundColor: colors.tag,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden',
  },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink },
  error: { marginTop: 16, color: colors.error, fontSize: 13, lineHeight: 19 },
  actions: {
    flexDirection: 'row', gap: 10, width: '100%', maxWidth: 520, alignSelf: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
  },
});
