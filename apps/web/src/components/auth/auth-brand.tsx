import Image from "next/image";
import Link from "next/link";

export function AuthBrand() {
  return (
    <Link href="/" aria-label="Slowpoke home" className="flex justify-center">
      <Image
        src="/wordmark.svg"
        alt="Slowpoke"
        width={1922}
        height={470}
        className="h-8 w-auto"
        priority
      />
    </Link>
  );
}
