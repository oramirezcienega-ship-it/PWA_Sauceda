import { redirect } from "next/navigation";

interface Props {
  params: {
    token: string;
  };
}

export default function ShortCotizacionRedirectPage({ params }: Props) {
  redirect(`/cotizacion/${params.token}`);
}
