import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { colors } from '../theme';
export type IconName = 'chat' | 'plus' | 'history' | 'camera' | 'settings' | 'back' | 'send' | 'cart' | 'check' | 'compare' | 'detail';
export default function Icon({ name, color = colors.ink, size = 18 }: { name: IconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    {name === 'chat' && <Path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" />}
    {name === 'plus' && <Path d="M12 5v14M5 12h14" />}
    {name === 'history' && <><Path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" /></>}
    {name === 'camera' && <><Path d="M3 6h4l2-3h6l2 3h4v15H3Z" /><Circle cx="12" cy="13" r="4" /></>}
    {name === 'settings' && <><Path d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v3m0 4v11M2 8h6M9 17h6M16 6h6" /></>}
    {name === 'back' && <Path d="m10 5-7 7 7 7M3 12h18" />}
    {name === 'send' && <Path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />}
    {name === 'cart' && <><Path d="M2 3h3l3 12h11l3-9H6M9 19h.01M18 19h.01" /><Circle cx="9" cy="20" r="1" /><Circle cx="18" cy="20" r="1" /></>}
    {name === 'check' && <><Rect x="3" y="3" width="18" height="18" rx="1" /><Path d="m7 12 3 3 7-7" /></>}
    {name === 'compare' && <><Rect x="3" y="3" width="18" height="18" rx="1" /><Path d="M12 3v18M7 8v8M17 6v12" /></>}
    {name === 'detail' && <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v6M12 7h.01" /></>}
  </Svg>;
}
