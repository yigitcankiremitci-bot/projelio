import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "./src/theme/colors";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import CalendarScreen from "./src/screens/CalendarScreen";

export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  Calendar: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const c = colors.light;
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: c.primary },
          headerTintColor: "#fff",
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Giriş" }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Projelio" }} />
        <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: "Takvim" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
