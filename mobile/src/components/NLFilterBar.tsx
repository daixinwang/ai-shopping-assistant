import { colors, fonts } from '../theme';
import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface AppliedFilter {
  key: string;
  label: string;
}

interface Props {
  onFilter: (query: string) => void;
  appliedFilters?: AppliedFilter[];
  isLoading?: boolean;
}

export default function NLFilterBar({ onFilter, appliedFilters = [], isLoading = false }: Props) {
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) onFilter(trimmed);
  };

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim()) {
      debounceRef.current = setTimeout(() => submit(text), 800);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <View style={styles.container}>
      {appliedFilters.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {appliedFilters.map((f) => (
            <View key={f.key} style={styles.filterChip}>
              <Text style={styles.filterText}>{f.label}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="例如：1000元以内的黑色款，评分4.8以上"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={handleChange}
          returnKeyType="search"
          onSubmitEditing={() => submit(query)}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => submit(query)} disabled={isLoading}>
          <Text style={styles.searchText}>{isLoading ? '解析中' : '筛选'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.rule, paddingBottom: 8 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 7 },
  filterChip: { backgroundColor: colors.ink, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6 },
  filterText: { color: colors.surface, fontSize: 12, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 5, gap: 8 },
  input: { flex: 1, backgroundColor: colors.wash, borderRadius: 3, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.ink },
  searchBtn: { backgroundColor: colors.ink, borderRadius: 3, paddingHorizontal: 14, paddingVertical: 10 },
  searchText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
});
