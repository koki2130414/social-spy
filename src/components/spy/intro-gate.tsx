'use client';

import { useEffect, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IntroVideo, hasSeenIntro, markIntroSeen } from './intro-video';

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
    if (!already && autoPlay) setPlaying(true);
  }, [autoPlay]);

  const close = () => {
    markIntroSeen();
    setSeen(true);
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
