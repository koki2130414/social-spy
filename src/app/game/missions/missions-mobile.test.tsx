import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ParticipantGameState } from '@/lib/types';

/** テスト用のゲーム状態 */
function buildState(overrides: Partial<ParticipantGameState> = {}): ParticipantGameState {
  return {
    event: {
      id: 'ev1',
      name: 'CROSS TALK NIGHT',
      code: 'SPY2026',
      phase: 'ACTIVE',
      phaseChangedAt: new Date().toISOString(),
      activeStartedAt: new Date().toISOString(),
      durationMinutes: 90,
      endsAt: null,
    },
    me: {
      id: 'p1',
      displayName: '佐藤 悠真',
      affiliation: 'フリーランス',
      role: 'AGENT',
      isSpy: false,
    },
    missions: [1, 2, 3].map((i) => ({
      assignmentId: `a${i}`,
      missionId: `m${i}`,
      orderIndex: i,
      code: `MISSION ${i}`,
      title: `タイトル${i}`,
      body: `内容${i}`,
      kind: 'GENERAL' as const,
      completed: false,
      completedAt: null,
    })),
    completedCount: 0,
    totalCount: 3,
    spyMissions: null,
    spyMissionsPublic: false,
    notifications: [],
    vote: null,
    participantCount: 12,
    ...overrides,
  };
}

const gameMock = vi.hoisted(() => ({
  state: null as ParticipantGameState | null,
  refresh: vi.fn(async () => {}),
}));

vi.mock('@/components/spy/game-shell', () => ({
  useGame: () => ({ state: gameMock.state, loading: false, error: null, refresh: gameMock.refresh }),
}));

const apiMock = vi.hoisted(() => ({
  send: vi.fn(async () => ({}) as unknown),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiSend: (...args: unknown[]) => apiMock.send(...(args as [])) };
});

import MissionsPage from './page';

/** マウント直後の非同期な状態更新を流し切ってから返す */
async function renderPage() {
  const utils = render(<MissionsPage />);
  await act(async () => {
    await Promise.resolve();
  });
  return utils;
}

/** 360px 幅のスマートフォンを想定 */
function setMobileViewport() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 360 });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 740 });
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  setMobileViewport();
  gameMock.state = buildState();
  apiMock.send.mockReset();
  apiMock.send.mockResolvedValue({});
  window.localStorage.clear();
});

describe('MISSION画面（モバイル幅360px）', () => {
  it('MISSIONが3件表示され、主要ボタンが操作できる', async () => {
    await renderPage();

    const buttons = screen.getAllByRole('button', { name: 'MISSION COMPLETE' });
    expect(buttons).toHaveLength(3);

    // タップ領域が44px以上確保されている（size=default の最小高さ）
    for (const button of buttons) {
      expect(button.className).toContain('min-h-[44px]');
      expect(button).toBeEnabled();
    }
  });

  it('MISSION COMPLETE を押すと確認ダイアログが開く', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getAllByRole('button', { name: 'MISSION COMPLETE' })[0]);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('達成を記録しますか？')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '達成にする' })).toBeInTheDocument();
  });

  it('LOBBY中は達成ボタンが無効化され、理由が表示される', async () => {
    gameMock.state = buildState({
      event: { ...buildState().event, phase: 'LOBBY', activeStartedAt: null },
    });
    await renderPage();

    for (const button of screen.getAllByRole('button', { name: 'MISSION COMPLETE' })) {
      expect(button).toBeDisabled();
    }
    expect(
      screen.getByText('ゲーム開始前のため、まだ達成の記録はできません。'),
    ).toBeInTheDocument();
  });

  it('一般参加者にはSPY MISSIONセクションが表示されない', async () => {
    await renderPage();
    expect(screen.queryByText('あなただけのMISSION')).not.toBeInTheDocument();
  });

  it('SPY本人には自分専用のMISSIONが表示される', async () => {
    gameMock.state = buildState({
      me: {
        id: 'p2',
        displayName: '鈴木 玲奈',
        affiliation: '広報',
        role: 'SPY',
        isSpy: true,
      },
      spyMissions: [
        {
          assignmentId: 's1',
          missionId: 'sm1',
          orderIndex: 1,
          code: 'INFORMATION GATHERING',
          title: '情報収集',
          body: '5人以上の参加者から情報を集めよ。',
          kind: 'SPY',
          completed: false,
          completedAt: null,
        },
      ],
    });
    await renderPage();
    expect(screen.getByText('あなただけのMISSION')).toBeInTheDocument();
    expect(screen.getByText('INFORMATION GATHERING')).toBeInTheDocument();
  });
});

describe('オフライン時のMISSION達成', () => {
  it('通信が届かないときは端末に保持し、未送信として表示する', async () => {
    // ApiError ではないエラー = サーバーに届いていない（通信断）
    apiMock.send.mockRejectedValue(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getAllByRole('button', { name: 'MISSION COMPLETE' })[0]);
    await user.click(await screen.findByRole('button', { name: '達成にする' }));

    // 画面上は達成済みとして扱われ、未送信であることが分かる
    expect(await screen.findByText('未送信')).toBeInTheDocument();
    expect(
      screen.getByText('1件が未送信です。通信が戻ると自動的に送信されます。'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'MISSION COMPLETE' })).toHaveLength(2);
    expect(screen.getByText('達成 1 / 3')).toBeInTheDocument();
  });

  it('サーバーに拒否された場合は保持せず、理由を表示する', async () => {
    const { ApiError } = await import('@/lib/api');
    apiMock.send.mockRejectedValue(
      new ApiError('PHASE_LOCKED', '現在のフェーズではMISSIONの達成状況を変更できません。', 403),
    );

    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getAllByRole('button', { name: 'MISSION COMPLETE' })[0]);
    await user.click(await screen.findByRole('button', { name: '達成にする' }));

    // サーバーが返した理由をそのまま出す
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '現在のフェーズではMISSIONの達成状況を変更できません。',
    );
    expect(screen.queryByText('未送信')).not.toBeInTheDocument();
    expect(screen.getByText('達成 0 / 3')).toBeInTheDocument();
  });
});
