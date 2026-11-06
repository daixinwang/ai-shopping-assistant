import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

export type IconName =
  | 'chat' | 'plus' | 'minus' | 'history' | 'camera' | 'image' | 'settings' | 'back' | 'send'
  | 'cart' | 'check' | 'compare' | 'detail' | 'close' | 'trash' | 'arrowUp' | 'arrowRight'
  | 'chevronRight' | 'undo' | 'stop' | 'refresh' | 'search' | 'receipt' | 'verified' | 'sparkle';

export default function Icon({ name, color = colors.ink, size = 18, strokeWidth = 1.8 }: {
  name: IconName; color?: string; size?: number; strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      {name === 'chat' && <Path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" />}
      {name === 'minus' && <Path d="M5 12h14" />}
      {name === 'history' && <Path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" />}
      {name === 'camera' && <><Path d="M3 7h4l2-3h6l2 3h4v13H3Z" /><Circle cx="12" cy="13" r="4" /></>}
      {name === 'image' && <><Rect x="3" y="4" width="18" height="16" rx="2" /><Circle cx="9" cy="10" r="2" /><Path d="m21 16-5-5-9 9" /></>}
      {name === 'settings' && <Path d="M5 3v5m0 4v9M12 3v10m0 4v4M19 3v3m0 4v11M2 8h6M9 17h6M16 6h6" />}
      {name === 'back' && <Path d="m15 5-7 7 7 7" />}
      {name === 'send' && <Path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />}
      {name === 'cart' && <><Path d="M2 3h3l3 12h11l3-9H6" /><Circle cx="9" cy="20" r="1" /><Circle cx="18" cy="20" r="1" /></>}
      {name === 'check' && <Path d="m5 12 5 5 9-10" />}
      {name === 'compare' && <><Rect x="3" y="4" width="7" height="16" rx="1.5" /><Rect x="14" y="4" width="7" height="16" rx="1.5" /></>}
      {name === 'detail' && <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v6M12 7h.01" /></>}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" />}
      {name === 'trash' && <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />}
      {name === 'arrowUp' && <Path d="M12 19V5M5 12l7-7 7 7" />}
      {name === 'arrowRight' && <Path d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'chevronRight' && <Path d="m9 6 6 6-6 6" />}
      {name === 'undo' && <Path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />}
      {name === 'stop' && <Rect x="7" y="7" width="10" height="10" rx="1.5" fill={color} />}
      {name === 'refresh' && <Path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />}
      {name === 'search' && <><Circle cx="11" cy="11" r="7" /><Path d="m20 20-4.2-4.2" /></>}
      {name === 'receipt' && <Path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h3" />}
      {name === 'verified' && <><Circle cx="12" cy="12" r="9" /><Path d="m8 12 3 3 5-6" /></>}
      {name === 'sparkle' && <Path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z" />}
    </Svg>
  );
}
