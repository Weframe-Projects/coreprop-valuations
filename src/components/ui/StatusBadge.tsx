const STATUS_STYLES = {
  draft: 'bg-yellow-100 text-yellow-800',
  review: 'bg-blue-100 text-blue-800',
  final: 'bg-green-100 text-green-800',
} as const;

export default function StatusBadge({ status }: { status: 'draft' | 'review' | 'final' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
