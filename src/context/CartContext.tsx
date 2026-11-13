import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import type { CartQuote, Personalization } from "../lib/types";
import { useToast } from "./ToastContext";

type AddItemInput = {
  productId: string;
  variantId?: string;
  quantity?: number;
  giftWrap?: boolean;
  giftMessage?: string;
  personalization?: Personalization;
};

type UpdateItemInput = {
  quantity?: number;
  giftWrap?: boolean;
  giftMessage?: string;
  personalization?: Personalization;
};

type CartPayload = { cart: CartQuote };

type CartContextValue = {
  cart: CartQuote | null;
  isLoading: boolean;
  isError: boolean;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (input: AddItemInput) => Promise<CartQuote>;
  updateItem: (id: string, input: UpdateItemInput) => Promise<CartQuote>;
  removeItem: (id: string) => Promise<CartQuote>;
  applyCoupon: (code: string) => Promise<CartQuote>;
  removeCoupon: () => Promise<CartQuote>;
  setPincode: (pincode: string) => Promise<CartQuote>;
  clearCart: () => Promise<CartQuote>;
  refresh: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [cartOpen, setCartOpen] = useState(false);

  const cartQuery = useQuery({
    queryKey: ["cart"],
    queryFn: () => api<CartPayload>("/cart"),
    staleTime: 15_000
  });

  const setCart = useCallback(
    (payload: CartPayload) => {
      queryClient.setQueryData(["cart"], payload);
      return payload.cart;
    },
    [queryClient]
  );

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const addItem = useCallback(
    async (input: AddItemInput) => {
      try {
        const payload = await api<CartPayload>("/cart/items", {
          method: "POST",
          body: {
            productId: input.productId,
            variantId: input.variantId ?? "",
            quantity: input.quantity ?? 1,
            giftWrap: input.giftWrap ?? false,
            giftMessage: input.giftMessage ?? "",
            ...(input.personalization ? { personalization: input.personalization } : {})
          }
        });
        setCart(payload);
        notify("Added to your bag.");
        setCartOpen(true);
        return payload.cart;
      } catch (error) {
        notify(errorMessage(error), "error");
        throw error;
      }
    },
    [notify, setCart]
  );

  const updateItem = useCallback(
    async (id: string, input: UpdateItemInput) => {
      try {
        const payload = await api<CartPayload>(`/cart/items/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: input
        });
        return setCart(payload);
      } catch (error) {
        notify(errorMessage(error), "error");
        await cartQuery.refetch();
        throw error;
      }
    },
    [notify, setCart, cartQuery]
  );

  const removeItem = useCallback(
    async (id: string) => {
      try {
        const payload = await api<CartPayload>(`/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
        setCart(payload);
        notify("Item removed.");
        return payload.cart;
      } catch (error) {
        notify(errorMessage(error), "error");
        throw error;
      }
    },
    [notify, setCart]
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      const payload = await api<CartPayload>("/cart/coupon", { method: "POST", body: { code } });
      setCart(payload);
      notify("Coupon applied.");
      return payload.cart;
    },
    [notify, setCart]
  );

  const removeCoupon = useCallback(async () => {
    const payload = await api<CartPayload>("/cart/coupon", { method: "DELETE" });
    setCart(payload);
    notify("Coupon removed.", "info");
    return payload.cart;
  }, [notify, setCart]);

  const setPincode = useCallback(
    async (pincode: string) => {
      const payload = await api<CartPayload>("/cart/shipping", { method: "POST", body: { pincode } });
      setCart(payload);
      return payload.cart;
    },
    [setCart]
  );

  const clearCart = useCallback(async () => {
    const payload = await api<CartPayload>("/cart", { method: "DELETE" });
    setCart(payload);
    return payload.cart;
  }, [setCart]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart: cartQuery.data?.cart ?? null,
      isLoading: cartQuery.isLoading,
      isError: cartQuery.isError,
      cartOpen,
      openCart,
      closeCart,
      addItem,
      updateItem,
      removeItem,
      applyCoupon,
      removeCoupon,
      setPincode,
      clearCart,
      refresh: () => void cartQuery.refetch()
    }),
    [
      cartQuery.data,
      cartQuery.isLoading,
      cartQuery.isError,
      cartQuery,
      cartOpen,
      openCart,
      closeCart,
      addItem,
      updateItem,
      removeItem,
      applyCoupon,
      removeCoupon,
      setPincode,
      clearCart
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
