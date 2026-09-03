'use client';

import { useEffect, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntroVideo, hasSeenIntro, markIntroSeen, type IntroCloseReason } from './intro-video';

/**
 * オープニング映像の出し分け。
 *
 * トップページとゲーム画面の両方に置く。どちらかで一度見れば、
 * もう片方では自動再生されない（見たかどうかは端末ごとに1つだけ覚える）。
 *
 * 判定は localStorage を読むのでブラウザ側でしかできない。
 * サーバー描画時に出しっぱなしにならないよう、マウント後に決める。
 *
 * autoPlay   : 未視聴なら自動で全画面再生する
 * showRewatch: 視聴済みの人に「もう一度見る」ボタンを出す
 *
 * 自動再生は画面ごとに1か所だけにすること（重ねると2つ開く）。
 */

/**
 * 再生に失敗した端末で、画面を移動するたびに再挑戦して待たされないようにする。
 * 「見た」とは記録しないので、次にアプリを開き直せばまた試す。
 */
const FAILED_KEY = 'buzz-base.intro-failed';

function failedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(FAILED_KEY) === '1';
  } catch {
    return false;
  }
}

function markFailedThisSession(): void {
  try {
    window.sessionStorage.setItem(FAILED_KEY, '1');
  } catch {
    // 保存できなくても動作は続けられる
  }
}

export function IntroGate({
  autoPlay = true,
  showRewatch = true,
  label = 'オープニングを見る',
}: {
  autoPlay?: boolean;
  showRewatch?: boolean;
  label?: string;
}) {
  const [playing, setPlaying] = useState(false);
  /** null = まだ判定していない（チラつき防止） */
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    const already = hasSeenIntro();
    setSeen(already);
    if (!already && autoPlay && !failedThisSession()) setPlaying(true);
  }, [autoPlay]);

  const close = (reason: IntroCloseReason) => {
    // 再生できずに閉じた場合は「見た」ことにしない。
    // 通信が悪い・裏で開かれたなどで一度失敗しただけで、
    // 二度とオープニングが出なくなってしまうため。
    if (reason === 'failed') {
      markFailedThisSession();
    } else {
      markIntroSeen();
      setSeen(true);
    }
    setPlaying(false);
  };

  if (playing) return <IntroVideo onClose={close} />;
  if (!showRewatch || seen === null) return null;

  return (
    <Button variant="outline" size="sm" onClick={() => setPlaying(true)}>
      <PlayCircle className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
