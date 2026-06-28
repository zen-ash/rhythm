// Polyfill the WHATWG URL API before anything imports @supabase/supabase-js.
// React Native's built-in URL is incomplete and breaks Supabase networking.
import "react-native-url-polyfill/auto";

import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
