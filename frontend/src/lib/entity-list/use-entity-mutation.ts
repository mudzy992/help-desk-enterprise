import { useRef } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

/** Shared mutation lifecycle: synchronous duplicate guard, precise invalidation, then feedback. */
export function useEntityMutation<TVariables, TResult = unknown>(options: {
  readonly mutationFn: (variables: TVariables) => Promise<TResult>;
  readonly invalidate: (variables: TVariables) => readonly QueryKey[];
  readonly onSuccess: (variables: TVariables, result: TResult) => void;
  readonly onError: (error: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const operationInFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: options.mutationFn,
    onSuccess: async (_result, variables) => {
      await Promise.all(
        options
          .invalidate(variables)
          .map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      options.onSuccess(variables, _result);
    },
    onError: options.onError,
    onSettled: () => {
      operationInFlight.current = false;
    },
  });

  const mutate: typeof mutation.mutate = (...arguments_) => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    mutation.mutate(...arguments_);
  };
  const mutateAsync: typeof mutation.mutateAsync = async (...arguments_) => {
    if (operationInFlight.current) throw new Error("ENTITY_MUTATION_IN_PROGRESS");
    operationInFlight.current = true;
    return mutation.mutateAsync(...arguments_);
  };

  return { ...mutation, mutate, mutateAsync };
}
