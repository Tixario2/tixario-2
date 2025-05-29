// components/EvenementCard.tsx
import Link from "next/link";
import Image from "next/image";

interface Props {
  artiste: string;
  ville: string;
  imageUrl: string;
  dates: string[];        // pour l’affichage
  slugEvent: string;      // ex: "acdc" ou "hellfestopenairfestival"
  slugDates?: string[];   // ISO dates ["2025-08-09", ...]
}

export default function EvenementCard({
  artiste,
  ville,
  imageUrl,
  dates,
  slugEvent,
  slugDates,
}: Props) {
  const hasMultipleDates = Array.isArray(slugDates) && slugDates.length > 1;

  // On ne garde que le premier segment du slug, mais slugEvent l'est déjà
  const baseSlug = slugEvent;

  // on décide du href
  const href = hasMultipleDates
    ? `/${baseSlug}`
    : `/${baseSlug}/${slugDates![0]}`;

  return (
    <Link href={href}>
      <div className="rounded-xl overflow-hidden bg-neutral-900 border border-neutral-700 hover:border-white transition-shadow duration-300 shadow-md shadow-neutral-800/40 hover:shadow-lg cursor-pointer">
        <div className="relative w-full h-48">
          <Image
            src={imageUrl}
            alt={artiste}
            layout="fill"
            objectFit="cover"
          />
        </div>
        <div className="p-4">
          <h3 className="text-lg font-semibold text-white truncate">
            {artiste}
          </h3>
          <p className="text-sm text-gray-400 mb-1">
            {ville}
          </p>
          {hasMultipleDates ? (
            <p className="text-sm text-gray-500 italic">
              {slugDates!.length} dates disponibles
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {dates[0]}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

