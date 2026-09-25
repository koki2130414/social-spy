import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  EyeOff,
  QrCode,
  ShieldAlert,
  Trophy,
  UserSearch,
  Vote,
  WifiOff,
} from 'lucide-react';
import { SpyLogo } from '@/components/spy/logo';
import { ClassifiedPanel } from '@/components/spy/classified-panel';
import { MISSIONS_PER_PARTICIPANT } from '@/lib/core/missions';
import { MAX_VOTE_TARGETS } from '@/lib/core/vote';

export const metadata = { title: '遊び方' };

/**
 * 遊び方のページ。
 *
 * ゲーム前（受付・開始待ち）にも、ゲーム中にも、同じ場所を見れば分かるようにする。
 *
 * ここは配信網から直接返す（静的）。
 *  ・ログインを要求しない。受付でまだ入れていない人も読める。
 *  ・サーバーへの問い合わせを1回もしない。100台が同時に開いても会場の回線に響かない。
 *  ・Service Worker が先に取っておくので、電波が切れていても開ける。
 *
 * --- SPY が漏れないようにするための約束 ---
 *
 * このページは誰が見ても同じ内容にすること。
 * 参加者ごとに出し分けると、肩越しに覗かれたときに正体が割れる。
 * Cookie・検索文字列・ヘッダを読む処理を足すと静的でなくなるので、足さない。
 *
 * 数字（MISSIONの数・投票できる人数）は実装の定数から取る。
 * ここに直接書くと、ルールを変えたときに説明だけが古くなる。
 */
export const dynamic = 'force-static';

const ROLES = [
  {
    key: 'agent',
    tone: 'intel' as const,
    tag: '正義の調査チーム',
    name: '情報員',
    en: 'AGENT',
    lead: 'MISSIONをこなしつつ、SPYを探せ！',
    points: [
      `全員にMISSIONが${MISSIONS_PER_PARTICIPANT}個配られる`,
      '会話や写真など、交流を通してMISSIONをクリア',
      '終盤にSPY MISSIONが公開されたら、交流の記憶を手がかりに怪しい人物を探し出す',
    ],
    quote: '「あの人、彼と写真撮ってた…」「話しているのを見た…」',
  },
  {
    key: 'spy',
    tone: 'danger' as const,
    tag: '潜入中',
    name: 'SPY',
    en: 'SPY',
    lead: '正体は秘密。バレずに任務を遂行せよ！',
    points: [
      'MISSIONは他の参加者と全く違う特殊なもの',
      '正体がバレないよう、自然に振る舞いながらMISSIONをクリア',
      '最終投票で票を集めると不利——最後まで潜伏をがんばろう',
    ],
    quote: '「ふつうの参加者を演じて…誰にも気づかれるな」',
  },
];

const FLOW = [
  {
    no: '1',
    when: 'ゲーム開始時',
    title: 'MISSION受領',
    body: `受付で配られたQRコードを読み取り、アプリで自分のMISSION（${MISSIONS_PER_PARTICIPANT}個）を確認。`,
    icon: QrCode,
  },
  {
    no: '2',
    when: '序盤〜中盤',
    title: '交流 & MISSION',
    body: '会話や写真など交流の中でMISSIONをどんどんクリア。達成したらアプリで記録。SPYはバレないように。',
    icon: ClipboardList,
  },
  {
    no: '3',
    when: '終盤',
    title: 'SPY MISSION公開',
    body: 'SPYに与えられていたMISSIONが公開される。情報員はここから調査タイム。',
    icon: EyeOff,
  },
  {
    no: '4',
    when: 'クライマックス',
    title: 'FINAL VOTE',
    body: `「SPYだと思う人物」をアプリから投票。最大${MAX_VOTE_TARGETS}人まで選べる。`,
    icon: Vote,
  },
];

const APP_FEATURES = [
  {
    icon: ClipboardList,
    label: `自分のMISSION（${MISSIONS_PER_PARTICIPANT}個）の確認と達成の記録`,
  },
  { icon: BarChart3, label: '他の参加者のMISSION達成率の確認' },
  { icon: EyeOff, label: '公開されたSPY MISSIONの確認' },
  { icon: Vote, label: '最終投票' },
  { icon: Trophy, label: '結果発表' },
];

const VOTE_RULES = [
  `1人以上、最大${MAX_VOTE_TARGETS}人まで選べる`,
  '自分自身には投票できない',
  '一度送ると変更できない。よく考えてから送る',
  '投票できるのは「投票受付中」のあいだだけ',
];

const PRIZES = [
  {
    side: 'SPY',
    ja: 'スパイ',
    tone: 'text-primary',
    winners: ['MISSIONのクリア最多の人', '1番投票数が低い人物（見事に潜伏できた証拠！）'],
  },
  {
    side: 'AGENT',
    ja: '情報員',
    tone: 'text-intel',
    winners: ['MISSIONのクリア最多の人', '1番SPYを当てた人（上位3名）'],
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <header className="space-y-3">
        <p className="label-mono">Field Manual / 遊び方</p>
        <SpyLogo />
        <p className="text-sm leading-relaxed text-muted-foreground">
          交流を楽しみながらMISSIONを遂行——終盤には、SPYを見抜け。
        </p>
      </header>

      {/* 2つの陣営 */}
      <section className="mt-8">
        <h2 className="headline-mono text-sm text-foreground">
          2つの陣営 <span className="label-mono ml-1">Roles</span>
        </h2>

        <div className="mt-3 space-y-3">
          {ROLES.map((role) => (
            <ClassifiedPanel key={role.key} className="p-5" tone={role.tone}>
              <p className="label-mono">{role.tag}</p>
              <p
                className={`headline-mono mt-1 text-xl ${
                  role.tone === 'danger' ? 'text-primary' : 'text-intel'
                }`}
              >
                {role.name}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{role.en}</span>
              </p>
              <p className="mt-1 text-sm text-foreground/85">{role.lead}</p>

              <div className="hairline my-4" />

              <ul className="space-y-2">
                {role.points.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                    <span
                      aria-hidden
                      className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                        role.tone === 'danger' ? 'bg-primary' : 'bg-intel'
                      }`}
                    />
                    {point}
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                {role.quote}
              </p>
            </ClassifiedPanel>
          ))}
        </div>
      </section>

      {/* ゲームの流れ */}
      <section className="mt-8">
        <h2 className="headline-mono text-sm text-foreground">
          ゲームの流れ <span className="label-mono ml-1">Flow</span>
        </h2>

        <ol className="mt-3 space-y-3">
          {FLOW.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.no} className="rounded-sm border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="headline-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-intel/60 text-xs text-intel">
                    {step.no}
                  </span>
                  <p className="headline-mono text-sm text-foreground">{step.title}</p>
                  <Icon className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                <p className="label-mono mt-2 text-amber/80">{step.when}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* アプリでできること */}
      <section className="mt-8">
        <h2 className="headline-mono text-sm text-foreground">
          アプリでできること <span className="label-mono ml-1">App</span>
        </h2>

        <div className="mt-3 rounded-sm border border-border bg-card p-5">
          <p className="text-sm text-foreground/85">
            受付で配布されたQRコードを読み取ってアクセス！
          </p>
          <div className="hairline my-4" />
          <ul className="space-y-2.5">
            {APP_FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-foreground/85">
                <Icon className="h-4 w-4 shrink-0 text-intel" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 投票のきまり */}
      <section className="mt-8">
        <h2 className="headline-mono text-sm text-foreground">
          投票のきまり <span className="label-mono ml-1">Final Vote</span>
        </h2>

        <ClassifiedPanel className="mt-3 p-5" tone="amber">
          <div className="flex items-center gap-2">
            <UserSearch className="h-4 w-4 shrink-0 text-amber" aria-hidden />
            <p className="headline-mono text-sm text-amber">SPYだと思う人を選ぶ</p>
          </div>
          <ul className="mt-3 space-y-2">
            {VOTE_RULES.map((rule) => (
              <li key={rule} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                {rule}
              </li>
            ))}
          </ul>
        </ClassifiedPanel>
      </section>

      {/* 景品 */}
      <section className="mt-8">
        <h2 className="headline-mono text-sm text-foreground">
          景品 <span className="label-mono ml-1">Prize</span>
        </h2>

        <div className="mt-3 space-y-3">
          {PRIZES.map((prize) => (
            <div key={prize.side} className="rounded-sm border border-border bg-card p-4">
              <p className={`headline-mono text-sm ${prize.tone}`}>
                {prize.ja}
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {prize.side}
                </span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {prize.winners.map((winner) => (
                  <li key={winner} className="flex gap-2 text-sm text-foreground/85">
                    <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />
                    {winner}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-3 rounded-sm border border-dashed border-border p-4 text-sm leading-relaxed text-muted-foreground">
          総合順位は、MISSIONの達成率（100%で1.00ポイント）と、当てたSPYの人数（1人につき1.00ポイント）を合わせて決まります。
        </p>
      </section>

      {/* こまったとき */}
      <section className="mt-8">
        <h2 className="headline-mono text-sm text-foreground">
          こまったとき <span className="label-mono ml-1">Support</span>
        </h2>

        <ul className="mt-3 space-y-2.5">
          <li className="flex gap-3 rounded-sm border border-border bg-card p-4 text-sm leading-relaxed text-foreground/85">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
            <span>
              画面が止まった・電波が切れたときは、アプリを閉じずにお待ちください。電波が戻ると自動的に再開します。記録した達成は復帰後にまとめて送られます。
            </span>
          </li>
          <li className="flex gap-3 rounded-sm border border-border bg-card p-4 text-sm leading-relaxed text-foreground/85">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              QRコードが読めない・アプリに入れないときは、受付の運営スタッフにお声がけください。
            </span>
          </li>
        </ul>

        <p className="mt-3 border border-dashed border-amber/40 bg-amber/5 p-4 text-sm leading-relaxed text-foreground/85">
          <span className="headline-mono mr-2 text-xs text-amber">ひとこと</span>
          投票の詳しい方法や進行のタイミングなど、わからない点があれば当日の運営スタッフに確認しよう。交流こそ最大の武器——楽しんでMISSIONに挑戦！
        </p>
      </section>

      {/* 戻り先 */}
      <nav className="safe-bottom mt-8 flex flex-col items-center gap-3 text-sm">
        <Link
          href="/game"
          className="tap-target headline-mono flex w-full items-center justify-center gap-2 rounded-sm border border-intel/60 text-intel"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          ゲーム画面へ戻る
        </Link>
        <Link href="/" className="text-xs text-muted-foreground underline underline-offset-4">
          トップへ
        </Link>
      </nav>
    </main>
  );
}
