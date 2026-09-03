import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntroGate } from './intro-gate';

/**
 * オープニング映像の出し分け。
 *
 * ここで守りたいのは「見ていないのに二度と出なくなる」ことを防ぐ点。
 * 通信が悪い・裏で開かれたなどで再生できずに閉じた場合、
 * 視聴済みとして記録してはいけない。
 */

const SEEN_KEY = 'buzz-base.intro-seen.v1';
const FAILED_KEY = 'buzz-base.intro-failed';

/** jsdom の video は再生されないので、読み込み状態を手で作る */
function stubVideo({ canPlay }: { canPlay: boolean }) {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => (canPlay ? 4 : 0),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'networkState', {
    configurable: true,
    get: () => 2,
  });
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
}

describe('IntroGate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('初回は自動で再生する', async () => {
    stubVideo({ canPlay: true });
    render(<IntroGate />);
    expect(await screen.findByRole('dialog', { name: 'オープニング映像' })).toBeTruthy();
  });

  it('スキップしたら視聴済みになり、次からは自動再生しない', async () => {
    stubVideo({ canPlay: true });
    const user = userEvent.setup();
    const view = render(<IntroGate />);
    await user.click(await screen.findByRole('button', { name: /スキップ/ }));

    expect(localStorage.getItem(SEEN_KEY)).toBe('1');

    view.unmount();
    render(<IntroGate />);
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'オープニング映像' })).toBeNull();
  });

  it('再生できずに閉じた場合は視聴済みにしない', async () => {
    vi.useFakeTimers();
    stubVideo({ canPlay: false });
    render(<IntroGate />);

    // 表示されている間だけ数える時間切れ（12秒）を進める
    await act(async () => {
      vi.advanceTimersByTime(13000);
    });

    expect(screen.queryByRole('dialog', { name: 'オープニング映像' })).toBeNull();
    // ここが要点。見ていないのだから、視聴済みにしてはいけない
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(FAILED_KEY)).toBe('1');
  });

  it('画面が隠れている間は時間切れにしない', async () => {
    vi.useFakeTimers();
    stubVideo({ canPlay: false });
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    render(<IntroGate />);
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    // 裏に回っている間はブラウザが読み込みを後回しにするので、閉じてはいけない
    expect(screen.queryByRole('dialog', { name: 'オープニング映像' })).toBeTruthy();
    hidden.mockRestore();
  });

  it('同じセッションで一度失敗したら、画面を移動しても再挑戦で待たせない', async () => {
    vi.useFakeTimers();
    stubVideo({ canPlay: false });
    const view = render(<IntroGate />);
    await act(async () => {
      vi.advanceTimersByTime(13000);
    });
    view.unmount();

    render(<IntroGate autoPlay showRewatch={false} />);
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'オープニング映像' })).toBeNull();
  });
});
