import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

/** Shared mutation lifecycle for entity modules: execute, invalidate precise keys, then notify. */
export function useEntityMutation<TVariables>(options: {
  readonly mutationFn: (variables: TVariables) => Promise<unknown>;
  readonly invalidate: (variables: TVariables) => readonly QueryKey[];
  readonly onSuccess: (variables: TVariables) => void;
  readonly onError: (error: unknown) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: options.mutationFn,
    onSuccess: async (_result, variables) => {
      await Promise.all(
        options
          .invalidate(variables)
          .map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      options.onSuccess(variables);
    },
    onError: options.onError,
  });
}
