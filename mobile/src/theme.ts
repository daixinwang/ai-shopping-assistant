import { Platform } from 'react-native';
export const colors = { ink: '#1f1a14', paper: '#f0e6d2', surface: '#f7f1e5', wash: '#e5dac4', rule: '#c9bda7', muted: '#716552', error: '#974432', success: '#526044' };
export const fonts = { editorial: Platform.select({ web: 'Georgia, "Songti SC", "SimSun", serif', ios: 'Georgia', default: 'serif' }) };
