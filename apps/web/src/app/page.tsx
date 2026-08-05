import Image from "next/image";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function Home() {
  return (
    <main className="bg-background text-foreground relative flex min-h-screen flex-col overflow-hidden">
      <nav className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-10 lg:px-12">
        <Link href="/" aria-label="Slowpoke home">
          <Image
            src="/wordmark.svg"
            alt="Slowpoke"
            width={1922}
            height={470}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <Link href="/login" className={buttonVariants()}>
          Get started
        </Link>
      </nav>

      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-start justify-center gap-8 px-6 pb-24 pt-12 sm:px-10 lg:px-12">
        <h1 className="max-w-5xl text-left text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-balance sm:text-7xl lg:text-[6.75rem]">
          Manage your company&apos;s AI usage
        </h1>

        <form className="w-full max-w-xl">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="waitlist-email" className="sr-only">
                Work email
              </FieldLabel>
              <Input
                id="waitlist-email"
                type="email"
                autoComplete="email"
                placeholder="Work email"
                required
                className="@md/field-group:flex-1"
              />
              <Button type="button" size="lg">
                Join the waitlist
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </section>
    </main>
  );
}
