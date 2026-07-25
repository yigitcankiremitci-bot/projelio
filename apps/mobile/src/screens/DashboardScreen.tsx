import { View, Text, FlatList, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import type { Project } from "@projelio/shared";

// TODO: gerçek veriler /projects endpoint'inden çekilecek
const mockProjects: Project[] = [];

export default function DashboardScreen({ navigation }: any) {
  const c = colors.light;
  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <FlatList
        data={mockProjects}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={{ color: c.textSecondary }}>Henüz proje yok.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={{ fontWeight: "600", color: c.textPrimary }}>{item.title}</Text>
            <Text style={{ color: c.accent }}>{item.totalBudget} ₺</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
});
