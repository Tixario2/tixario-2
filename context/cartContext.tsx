// context/cartContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';

export const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);

  // Charger depuis localStorage au premier rendu
  useEffect(() => {
    const storedCart = localStorage.getItem('cart');
    if (storedCart) {
      setCart(JSON.parse(storedCart));
    }
  }, []);

  // Sauvegarder dans localStorage dès que le panier change
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
    console.log('📦 Panier enregistré dans localStorage :', cart);
  }, [cart]);

  // Ajouter au panier (additionne, mais pas plus que le stock dispo,
  // et fonctionne immédiatement même en clic rapide)
  const addToCart = (billet, quantite) => {
    console.log('🧺 Ajout au panier :', billet, 'quantité demandée :', quantite);

    setCart(prev => {
      // trouve l'entrée existante (le cas échéant)
      const idx = prev.findIndex(item => item.id_billet === billet.id_billet);
      const already = idx >= 0 ? prev[idx].quantite : 0;
      const maxAdd = billet.quantite - already;       // combien il reste
      const toAdd = Math.min(quantite, maxAdd);       // n'ajoute pas plus que dispo
      if (toAdd <= 0) return prev;                    // rien à faire

      // reconstruit le panier sans doublons
      const base = prev.filter(item => item.id_billet !== billet.id_billet);
      return [...base, { ...billet, quantite: already + toAdd }];
    });
  };

  // Retirer un billet du panier
  const removeFromCart = (id_billet) => {
    setCart(prev => prev.filter(item => item.id_billet !== id_billet));
  };

  // Vider complètement le panier
  const clearCart = () => {
    setCart([]);
    localStorage.removeItem('cart');
  };

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
