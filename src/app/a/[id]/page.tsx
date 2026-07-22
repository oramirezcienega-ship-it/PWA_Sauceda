import { redirect } from "next/navigation";

interface Props {
  params: {
    id: string;
  };
}

export default function ShortCitaRedirectPage({ params }: Props) {
  redirect(`/agenda/cita/${params.id}`);
}
