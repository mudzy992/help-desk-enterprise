interface PlaceholderPageProperties {
  readonly heading: string;
  readonly body: string;
}

export function PlaceholderPage({ heading, body }: PlaceholderPageProperties) {
  return (
    <section className="max-w-2xl">
      <h2 className="text-section font-medium text-foreground">{heading}</h2>
      <p className="mt-2 text-body leading-6 text-muted-foreground">{body}</p>
    </section>
  );
}
