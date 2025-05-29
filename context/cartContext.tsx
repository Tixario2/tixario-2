// context/cartContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';

interface CartItem {
  id_billet: string;
  quantite: number;
  [key: string]: any; // autres propriétés de billet si nécessaire
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (billet: CartItem, quantite: number) => void;
  removeFromCart: (id_billet: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Charger depuis localStorage au premier rendu
  useEffect(() => {
    const storedCart = typeof window !== 'undefined' ? localStorage.getItem('cart') : null;
    if (storedCart) {
      setCart(JSON.parse(storedCart));
    }
  }, []);

  // Sauvegarder dans localStorage dès que le panier change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cart', JSON.stringify(cart));
      console.log('📦 Panier enregistré dans localStorage :', cart);
    }
  }, [cart]);

  const addToCart = useCallback((billet: CartItem, quantite: number) => {
    console.log('🧺 Ajout au panier :', billet, 'quantité demandée :', quantite);

    setCart(prev => {
      const idx = prev.findIndex(item => item.id_billet === billet.id_billet);
      const already = idx >= 0 ? prev[idx].quantite : 0;
      const maxAdd = ('quantite' in billet ? billet.quantite : 0) - already;
      const toAdd = Math.min(quantite, maxAdd);
      if (toAdd <= 0) return prev;

      const base = prev.filter(item => item.id_billet !== billet.id_billet);
      return [...base, { ...billet, quantite: already + toAdd }];
    });
  }, []);

  const removeFromCart = useCallback((id_billet: string) => {
    setCart(prev => prev.filter(item => item.id_billet !== id_billet));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cart');
    }
  }, []);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
