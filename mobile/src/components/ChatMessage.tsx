import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AgentProduct } from '../api/client';
import AgentProductCard from './AgentProductCard';
import { InlineCaret, LogoMark, ScanLoader } from './Brand';
import Icon from './Icon';
import {
  CartSummary, CheckoutCard, ChoicesCard, CompareTable, OrderCard, SpecCard,
} from './MessageCards';
import { Chip } from './ui';
import type { Message } from '../utils/conversations';
import { colors, radii, text } from '../theme';

const PHASES: Record<string, string[]> = {
  text: ['routing', 'tool', 'compose'],
  image: ['vision', 'tool', 'compose'],
};
const PHASE_LABELS: Record<string, string> = {
  routing: '理解需求', vision: '识别图片', tool: '检索商品', compose: '组织回答',
};

function Working({ phase, label }: { phase?: string; label?: string }) {
  const steps = phase === 'vision' || label?.includes('图') ? PHASES.image : PHASES.text;
  const current = Math.max(0, steps.indexOf(phase || steps[0]));
  return (
    <View style={styles.working} accessibilityLiveRegion="polite" accessibilityLabel={label || '正在处理'}>
      <View style={styles.workingHead}>
        <ScanLoader />
        <Text style={styles.workingText}>{label || '正在理解需求…'}</Text>
      </View>
      <View style={styles.steps} accessible={false}>
        {steps.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={[styles.stepDot, index < current && styles.stepDone, index === current && styles.stepNow]} />
            <Text style={[styles.stepText, index <= current && { color: colors.ink }]}>{PHASE_LABELS[step]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function UserBubble({ message }: { message: Message }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        {message.hasImage && (
          <View style={styles.imageNote}>
            <Icon name="image" size={15} color={colors.tag} />
            <Text style={styles.imageNoteText}>图片找物</Text>
          </View>
        )}
        {!!message.text && <Text style={styles.userText} selectable>{message.text}</Text>}
      </View>
    </View>
  );
}

interface AnswerProps {
  message: Message;
  latest: boolean;
  busy: boolean;
  selectedIds: string[];
  onSend: (text: string) => void;
  onRetry: (message: Message) => void;
  onOpenProduct: (product: AgentProduct) => void;
  onToggleCompare: (product: AgentProduct) => void;
  onAdd: (product: AgentProduct) => void;
}

export function AssistantMessage({
  message, latest, busy, selectedIds, onSend, onRetry, onOpenProduct, onToggleCompare, onAdd,
}: AnswerProps) {
  const streaming = message.status === 'streaming';
  const interactive = latest && !busy;
  const card = message.card;
  return (
    <View style={styles.answerRow}>
      <View style={styles.avatar}><LogoMark size={24} /></View>
      <View style={styles.answer}>
        {streaming && !message.text && <Working phase={message.phase} label={message.phaseLabel} />}
        {!!message.text && (
          <Text style={styles.answerText} selectable>
            {message.text}{streaming && <InlineCaret />}
          </Text>
        )}

        {!!message.products?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel}
            contentContainerStyle={{ paddingRight: 8 }}>
            {message.products.map(product => (
              <AgentProductCard key={product.productId} product={product}
                reason={message.reasons?.[product.productId]} writing={streaming}
                selected={selectedIds.includes(product.productId)}
                onOpen={() => onOpenProduct(product)} onToggleCompare={() => onToggleCompare(product)}
                onAdd={() => onAdd(product)} />
            ))}
          </ScrollView>
        )}

        {card?.kind === 'checkout' && (
          <CheckoutCard preview={card.preview} active={latest} disabled={busy}
            onConfirm={() => onSend('确认下单')} onCancel={() => onSend('再想想')} />
        )}
        {card?.kind === 'order' && <OrderCard order={card.order} />}
        {card?.kind === 'cart' && <CartSummary cart={card.cart} />}
        {card?.kind === 'compare' && <CompareTable comparison={card.comparison} />}
        {card?.kind === 'spec' && (
          <SpecCard title={card.title} dimensions={card.dimensions} active={interactive} onPick={onSend} />
        )}
        {card?.kind === 'choices' && <ChoicesCard options={card.options} active={interactive} onPick={onSend} />}

        {message.status === 'error' && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>这次回答没有完成{message.error ? `：${message.error}` : '。'}</Text>
            {message.retry && <Chip label="重试" icon="refresh" tone="ink" disabled={busy} onPress={() => onRetry(message)} />}
          </View>
        )}

        {latest && message.status === 'done' && !!message.followups?.length && (
          <View style={styles.followups}>
            {message.followups.map(item => <Chip key={item} label={item} icon="arrowRight" disabled={busy} onPress={() => onSend(item)} />)}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', marginBottom: 18 },
  userBubble: {
    maxWidth: '82%', backgroundColor: colors.ink, borderRadius: 20, borderBottomRightRadius: 6,
    paddingHorizontal: 16, paddingVertical: 11, gap: 6,
  },
  userText: { color: colors.surface, fontSize: 15, lineHeight: 22 },
  imageNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  imageNoteText: { color: colors.tag, fontSize: 12, fontWeight: '700' },
  answerRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  answer: { flex: 1, minWidth: 0 },
  answerText: { ...text.body, fontSize: 16, lineHeight: 25 },
  working: { gap: 10, paddingVertical: 4 },
  workingHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  workingText: { ...text.small, color: colors.ink, fontWeight: '600' },
  steps: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.faint },
  stepDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  stepNow: { backgroundColor: colors.tag, borderColor: colors.ink },
  stepText: { fontSize: 12, color: colors.faint },
  carousel: { marginTop: 12, marginRight: -16 },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10,
    padding: 12, borderRadius: radii.md, backgroundColor: '#FBEAE6',
  },
  errorText: { flex: 1, minWidth: 160, color: colors.error, fontSize: 13, lineHeight: 19 },
  followups: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
});
