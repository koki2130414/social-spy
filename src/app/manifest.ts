import type { MetadataRoute } from 'next';

/**
 * Web App Manifest。
 * ホーム画面に追加したときのアイコン・起動方法・表示モードを定義する。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SOCIAL SPY',
    short_name: 'SOCIAL SPY',
    description: '交流を、ゲームにする。交流会向けのスパイ探し × 交流ゲーム',
    lang: 'ja',
    dir: 'ltr',
    start_url: '/game',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    categories: ['games', 'social', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/game.png',
        sizes: '720x1480',
        type: 'image/png',
        form_factor: 'narrow',
        label: '自分の役割とMISSION達成状況',
      },
      {
        src: '/screenshots/missions.png',
        sizes: '720x1480',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'MISSIONの確認と達成の記録',
      },
    ],
    shortcuts: [
      { name: 'MISSION', short_name: 'MISSION', url: '/game/missions' },
      { name: 'SPY INTEL', short_name: 'INTEL', url: '/game/intel' },
      { name: 'FINAL VOTE', short_name: 'VOTE', url: '/game/vote' },
    ],
  };
}
