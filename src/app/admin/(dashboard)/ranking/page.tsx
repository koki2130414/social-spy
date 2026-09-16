'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdmin } from '@/components/spy/admin-shell';
import { useAdminResource } from '@/hooks/use-admin-resource';
import { formatDateTime } from '@/lib/datetime';
import { downloadTextFile } from '@/lib/download-csv';
import type { RankingRow } from '@/lib/types';

interface AdminRanking {
  rows: RankingRow[];
  overall: number;
  includesSpyMissions: boolean;
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <p className="label-mono">{label}</p>
      <p className="mt-1 font-mono text-2xl text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function AdminRankingPage() {
  const { eventId } = useAdmin();
  const { data, loading, error } = useAdminResource<AdminRanking>(
    eventId ? `/api/admin/events/${eventId}/ranking` : null,
    10000,
  );
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((r) => r.displayName.toLowerCase().includes(q));
  }, [data, query]);

  /** 表彰用に手元へ落とせるようにする。名前と達成率だけの軽いCSV */
  const downloadCsv = () => {
    const header = '順位,名前,所属・肩書き,達成率,達成,配布,最終達成時刻';
    const lines = (data?.rows ?? []).map((r) =>
      [
        r.rank,
        `"${r.displayName.replace(/"/g, '""')}"`,
        `"${(r.affiliation ?? '').replace(/"/g, '""')}"`,
        `${r.percent}%`,
        r.completed,
        r.total,
        r.lastCompletedAt ?? '',
      ].join(','),
    );
    // Excelで文字化けしないようBOMを付ける
    // 日本語のファイル名は環境によって捨てられるので半角英数字にする
    downloadTextFile('quest-completion.csv', '\uFEFF' + [header, ...lines].join('\r\n'));
  };

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">イベントを選択してください。</p>;
  }
  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p role="alert" className="border border-primary/50 bg-primary/10 p-3 text-sm text-primary">
        {error ?? 'データを取得できませんでした。'}
      </p>
    );
  }

  const finished = data.rows.filter((r) => r.percent === 100).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">クエスト</p>
          <h1 className="headline-mono mt-1 text-xl">達成率ランキング</h1>
        </div>
        <div className="flex items-center gap-2">
          {data.includesSpyMissions ? (
            <Badge variant="danger">SPY MISSION を含む</Badge>
          ) : (
            <Badge variant="outline">一般クエストのみ</Badge>
          )}
          <Button size="sm" variant="outline" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            CSV
          </Button>
        </div>
      </header>

      {!data.includesSpyMissions ? (
        <p className="rounded-sm border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
          正体公開まで、ランキングは一般クエストだけで計算されます。SPY
          MISSIONを含めてしまうと、公開の瞬間にSPYだけ達成率が落ちて正体が分かってしまうためです。
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="全体の達成率" value={`${data.overall}%`} />
        <Tile label="全問達成した人" value={finished} sub={`${data.rows.length}名中`} />
        <Tile label="集計対象" value={data.rows.length} sub="欠席者を除く" />
        <Tile label="1位の達成率" value={`${data.rows[0]?.percent ?? 0}%`} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="q">名前検索</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder="名前で絞り込み"
          />
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>順位</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>所属・肩書き</TableHead>
              <TableHead>達成率</TableHead>
              <TableHead>達成</TableHead>
              <TableHead>最終達成</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.participantId}>
                <TableCell className="font-mono text-base font-bold tabular-nums text-foreground">
                  {r.rank}
                </TableCell>
                <TableCell className="font-medium text-foreground">{r.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{r.affiliation ?? '-'}</TableCell>
                <TableCell className="font-mono tabular-nums text-intel">{r.percent}%</TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {r.completed}/{r.total}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {r.lastCompletedAt ? formatDateTime(r.lastCompletedAt) : '-'}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  該当する参加者がいません。
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        同じ達成率の人は同じ順位です（1位が複数いることがあります）。
        表彰で1人に絞りたいときは「最終達成」の早い順にしてください。
      </p>
    </div>
  );
}
