export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <div className="card py-10 text-center">
      <h5 className="font-heading text-[15px] font-bold">{title}</h5>
      {message && <p className="mt-1 text-muted">{message}</p>}
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return <EmptyState title={title} message="This page is built in a later phase." />;
}
