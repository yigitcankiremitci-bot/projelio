import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

export default function CalendarScreen() {
  const c = colors.light;
  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={{ color: c.textSecondary }}>
        Günlük / haftalık / aylık takvim burada render edilecek.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
