import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PaginaCRM({
  searchParams,
}: {
  searchParams?: { expedienteId?: string; id?: string };
}) {
  const expId = searchParams?.expedienteId || searchParams?.id;
  if (expId) {
    redirect(`/expediente/${expId}`);
  } else {
    redirect("/");
  }
}
