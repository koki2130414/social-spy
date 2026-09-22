import { after } from 'next/server';

/**
 * 応答を返したあとに実行する。
 *
 * 運営が押すボタン（フェーズ変更など）では、通知の送信のように
 * 「結果を待つ必要がない外部への送信」がぶら下がっている。
 * これを待ってから応答すると、人数ぶんの送信が終わるまで
 * 画面が反応しない。会場ではこれが「重い」に直結する。
 *
 * Next.js の after はリクエストの外（テストなど）では例外を投げるので、
 * そのときは待たずに走らせるだけにする。
 * どちらの経路でも、失敗しても本来の処理は止めない。
 */
export function runAfterResponse(task: () => Promise<unknown>, label: string): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.warn(`${label}: ${String(error)}`);
    }
  };

  try {
    after(guarded);
  } catch {
    // リクエストの外から呼ばれた場合（テストなど）
    void guarded();
  }
}
