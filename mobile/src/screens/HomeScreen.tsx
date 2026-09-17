import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors as c, fonts } from '../theme';
import ActionButton from '../components/ActionButton';
import Icon from '../components/Icon';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Home'> };
export default function HomeScreen({ navigation }: Props) {
  const wide = useWindowDimensions().width >= 850;
  return (
    <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={{ flexGrow: 1 }}><View style={[s.page, !wide && s.mobile]}>
      <View style={s.topline}><Text style={s.micro}>THE SHOPPING COMPANION</Text><Text style={s.micro}>用心挑选 · 日常好物</Text></View>
      <View style={s.masthead}><Text accessibilityRole="header" style={[s.wordmark, !wide && s.smallWordmark]}>AI 购物助手</Text>{wide && <Text style={s.mastheadNote}>一份关于选择的生活手册。{'\n'}少一点犹豫，多一点合适。</Text>}</View>
      <View style={s.nav}>
        <Text style={s.current}>购物手册</Text>
        <ActionButton icon="chat" label="对话选物" onPress={() => navigation.navigate('Assistant')} />
        <ActionButton icon="camera" label="图片找物" onPress={() => navigation.navigate('Camera')} />
        <ActionButton icon="settings" label="我的偏好" style={{ marginLeft: 'auto' }} onPress={() => navigation.navigate('Preferences')} />
      </View>
      <View style={[s.feature, wide && s.featureWide]}>
        <View style={[s.lead, wide && { flex: 1.6, paddingRight: 20 }]}>
          <Text style={s.kicker}>THE ART OF CHOOSING / 选物有道</Text>
          <Text accessibilityRole="header" style={[s.headline, !wide && s.smallHeadline]}>好东西，{'\n'}要适合你的生活。</Text>
          <Text style={s.intro}>从一副通勤耳机，到一支日常防晒。告诉我们你的预算和使用场景，让每一次选择都有理由。</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => navigation.navigate('Assistant')}><View><Text style={s.primaryLabel}>你的下一件好物，从这里开始</Text><Text style={s.primaryTitle}>和导购聊一聊</Text></View><Icon name="chat" color={c.paper} size={30} /></TouchableOpacity>
          <Text style={s.caption}>描述需求 · 逐步筛选 · 对比后再决定</Text>
        </View>
        <View style={[s.sidebar, wide && s.sidebarWide]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Camera')}>
            <View style={s.viewfinder}><View style={s.lens}><View style={s.lensInner}><Icon name="camera" size={30} /></View></View><Text style={s.finderLabel}>A DIFFERENT WAY TO FIND</Text></View>
            <Text style={s.kicker}>VISUAL SEARCH / 图片找物</Text><View style={s.storyHeading}><Text style={s.storyTitle}>看见喜欢的，找到相似的。</Text><Text style={s.arrow}>↗</Text></View><Text style={s.body}>拍一张照片，或从相册上传。让图片帮你表达想找的东西。</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={s.preference} onPress={() => navigation.navigate('Preferences')}><Text style={s.kicker}>PERSONAL NOTES / 我的偏好</Text><View style={s.storyHeading}><Text style={s.storyTitle}>让推荐更懂你。</Text><Text style={s.arrow}>↗</Text></View><Text style={s.body}>记下预算、喜欢的品牌和特别在意的细节。</Text></TouchableOpacity>
        </View>
      </View>
      <View style={s.sectionHeading}><Text style={s.sectionTitle}>把需求说具体，好物更近一步。</Text><Text style={s.micro}>FIELD NOTES</Text></View>
      <View style={[s.notes, wide && { flexDirection: 'row', gap: 0 }]}>{[['预算', '先划定一个范围', '“想找 500 元以内的日常防晒。”'], ['场景', '说说你会怎么用', '“每天通勤两小时，想要续航好的耳机。”'], ['取舍', '找到最在意的细节', '“这几款有什么区别？有没有更轻的？”']].map(([label, title, detail], index) => <View key={label} style={[s.note, wide && { flex: 1, paddingRight: 22 }, wide && index > 0 && s.noteDivider]}><Text style={s.noteLabel}>{label}</Text><Text style={s.noteTitle}>{title}</Text><Text style={s.body}>{detail}</Text></View>)}</View>
      <View style={s.footer}><Text style={s.footerText}>AI 购物助手 · 本地演示商品目录</Text><ActionButton icon="settings" label="服务设置" onPress={() => navigation.navigate('Settings')} /></View>
    </View></ScrollView></SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.paper }, page: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 48, paddingTop: 24, paddingBottom: 16 }, mobile: { paddingHorizontal: 22, paddingTop: 16 },
  topline: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderColor: c.ink }, micro: { color: c.muted, fontSize: 10, letterSpacing: 1 }, masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }, wordmark: { fontFamily: fonts.editorial, fontSize: 64, fontWeight: '700', color: c.ink, letterSpacing: -1 }, smallWordmark: { fontSize: 42, letterSpacing: -1 }, mastheadNote: { color: c.muted, fontSize: 13, lineHeight: 23, textAlign: 'right' },
  nav: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 3, borderBottomWidth: 1, borderColor: c.ink, gap: 8, flexWrap: 'wrap', paddingVertical: 10 }, current: { fontSize: 13, color: c.ink, fontWeight: '800', paddingVertical: 14 }, navButton: { minHeight: 44, justifyContent: 'center' }, navText: { fontSize: 13, color: c.ink },
  feature: { paddingVertical: 32, gap: 32 }, featureWide: { flexDirection: 'row', gap: 36 }, lead: { justifyContent: 'center' }, kicker: { fontSize: 10, color: c.muted, letterSpacing: 1.4, fontWeight: '600', marginBottom: 14 }, headline: { fontFamily: fonts.editorial, fontSize: 49, lineHeight: 68, fontWeight: '700', color: c.ink, marginBottom: 22 }, smallHeadline: { fontSize: 34, lineHeight: 50 }, intro: { color: c.muted, fontSize: 15, lineHeight: 28, maxWidth: 450, marginBottom: 30 },
  primary: { backgroundColor: c.ink, padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, primaryLabel: { color: c.paper, fontSize: 11, marginBottom: 10 }, primaryTitle: { color: c.paper, fontSize: 23, fontWeight: '600' }, primaryArrow: { color: c.paper, fontSize: 34 }, caption: { fontSize: 11, color: c.muted, marginTop: 12, letterSpacing: 1 }, sidebar: { gap: 22 }, sidebarWide: { flex: 1, borderLeftWidth: 1, borderColor: c.rule, paddingLeft: 32 },
  viewfinder: { height: 156, backgroundColor: c.wash, borderWidth: 1, borderColor: c.rule, marginBottom: 20, alignItems: 'center', justifyContent: 'center' }, lens: { width: 86, height: 86, borderRadius: 43, borderWidth: 1, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' }, lensInner: { width: 66, height: 66, borderRadius: 33, borderWidth: 1, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' }, lensMark: { color: c.ink, fontSize: 25, fontWeight: '300' }, finderLabel: { color: c.muted, fontSize: 8, letterSpacing: 2, marginTop: 14 }, storyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 }, storyTitle: { fontFamily: fonts.editorial, fontSize: 20, fontWeight: '700', color: c.ink, flex: 1 }, arrow: { fontSize: 22, color: c.ink }, body: { color: c.muted, fontSize: 13, lineHeight: 23 }, preference: { borderTopWidth: 1, borderColor: c.rule, paddingTop: 20 },
  sectionHeading: { borderTopWidth: 2, borderColor: c.ink, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, sectionTitle: { color: c.ink, fontSize: 17, fontWeight: '700' }, notes: { paddingVertical: 22, gap: 20 }, note: { gap: 8 }, noteDivider: { borderLeftWidth: 1, borderColor: c.rule, paddingLeft: 24 }, noteLabel: { fontSize: 11, color: c.muted }, noteTitle: { color: c.ink, fontSize: 17, fontFamily: fonts.editorial, fontWeight: '700' }, footer: { paddingTop: 12, borderTopWidth: 1, borderColor: c.ink, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, footerText: { fontSize: 10, color: c.muted },
});
