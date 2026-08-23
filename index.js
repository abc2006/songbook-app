// Muss vor allem anderen importiert werden - Supabase (URL-Parsing) braucht
// das auf Hermes/React Native, sonst schlägt createClient() fehl.
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
