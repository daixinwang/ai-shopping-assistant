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

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim()) {
      debounceRef.current = setTimeout(() => {
        onFilter(text.trim());
      }, 800);
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
          placeholder="例如：500元以内的黑色款，评分4.8以上..."
          placeholderTextColor="#aaa"
          value={query}
          onChangeText={handleChange}
          returnKeyType="search"
          onSubmitEditing={() => query.trim() && onFilter(query.trim())}
        />
        {isLoading && <Text style={styles.loading}>⏳</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: 8 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 6 },
  filterChip: { backgroundColor: '#007AFF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6 },
  filterText: { color: '#fff', fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4 },
  input: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#333' },
  loading: { marginLeft: 8, fontSize: 16 },
});
