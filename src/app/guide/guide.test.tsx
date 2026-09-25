import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuidePage from './page';
import { MISSIONS_PER_PARTICIPANT } from '@/lib/core/missions';
import { MAX_VOTE_TARGETS } from '@/lib/core/vote';

/**
 * 遊び方のページ。
 *
 * このページの役目は「当日、迷った人がここを見れば分かる」こと。
 * いちばん怖いのは、ルールを変えたのに説明だけが古いまま残ることで、
 * 会場で「アプリの説明と違う」と言われる状況になる。
 * だから数字は実装の定数と突き合わせる。
 *
 * もうひとつ怖いのは、このページが参加者ごとに違う内容になること。
 * 誰が見ても同じでなければ、肩越しに覗かれたときに正体が割れる。
 * ここではサーバーへ問い合わせず、役割を受け取らないことを確かめる。
 */

describe('遊び方のページ', () => {
  it('ログインしていなくても、そのまま表示できる', () => {
    // 引数も文脈も渡さずに描ける＝参加情報を必要としていない
    expect(() => render(<GuidePage />)).not.toThrow();
    expect(screen.getByText(/交流を楽しみながらMISSIONを遂行/)).toBeInTheDocument();
  });

  it('配られるMISSIONの数が、実装と一致している', () => {
    render(<GuidePage />);
    const text = document.body.textContent ?? '';

    expect(text).toContain(`全員にMISSIONが${MISSIONS_PER_PARTICIPANT}個配られる`);
    // 3個と書いてあるのに4個配る、のような食い違いを防ぐ
    const wrong = MISSIONS_PER_PARTICIPANT + 1;
    expect(text).not.toContain(`全員にMISSIONが${wrong}個配られる`);
  });

  it('投票できる人数が、実装と一致している', () => {
    render(<GuidePage />);
    const text = document.body.textContent ?? '';

    expect(text).toContain(`最大${MAX_VOTE_TARGETS}人まで選べる`);
  });

  it('投票が変更できないことを、はっきり書いている', () => {
    render(<GuidePage />);
    // 当日いちばん問い合わせが来る点。ここが抜けると受付が止まる
    expect(screen.getByText(/一度送ると変更できない/)).toBeInTheDocument();
  });

  it('両方の陣営と、景品の条件が載っている', () => {
    render(<GuidePage />);
    const text = document.body.textContent ?? '';

    expect(text).toContain('情報員');
    expect(text).toContain('SPY');
    expect(text).toContain('1番投票数が低い人物');
    expect(text).toContain('1番SPYを当てた人');
  });

  it('ゲーム画面とトップの両方へ戻れる', () => {
    render(<GuidePage />);
    // ゲーム中に開いた人も、受付で開いた人も、行き止まりにならないこと
    expect(screen.getByRole('link', { name: /ゲーム画面へ戻る/ })).toHaveAttribute('href', '/game');
    expect(screen.getByRole('link', { name: 'トップへ' })).toHaveAttribute('href', '/');
  });

  it('誰が見ても同じ内容になる（役割で出し分けない）', () => {
    const first = render(<GuidePage />).container.innerHTML;
    const second = render(<GuidePage />).container.innerHTML;
    expect(first).toBe(second);

    // 本人の正体につながる語を持ち込んでいないこと
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('あなたはSPY');
    expect(text).not.toContain('YOUR IDENTITY');
  });
});
