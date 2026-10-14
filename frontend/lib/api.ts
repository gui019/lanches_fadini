export async function requestApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Protection": "1",
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Não foi possível conectar. Verifique sua conexão e tente novamente.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fields = data.errors
      ?.map(
        (e: { field: string; message: string }) => `${e.field}: ${e.message}`,
      )
      .join("; ");
    throw new Error(
      `${typeof data.detail === "string" ? data.detail : "Não foi possível completar a solicitação."}${fields ? ` ${fields}` : ""}`,
    );
  }
  return data as T;
}
