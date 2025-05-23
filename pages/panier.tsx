// pages/panier.tsx
import React from 'react';
import Image from 'next/image';
import { useCart } from '@/context/cartContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PanierPage(): JSX.Element {
  const { cart, removeFromCart } = useCart();

  // 1) Total price
  const total = cart.reduce((acc, item) => acc + item.prix * item.quantite, 0);

  // 2) Group tickets by event+date
  type CartItem = typeof cart[number];
  type Group = { info: CartItem; items: CartItem[] };
  const groups: Record<string, Group> = cart.reduce((acc, item) => {
    const key = `${item.evenement}__${item.date}`;
    if (!acc[key]) acc[key] = { info: item, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, Group>);

  // 3) Checkout handler
  const checkout = async () => {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartItems: cart }),
    });
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert('Erreur lors de la création de la session de paiement.');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <span role="img" aria-label="panier">
          🛒
        </span>{' '}
        Ton panier
      </h1>

      {cart.length === 0 ? (
        <p className="text-gray-400 italic">Ton panier est vide.</p>
      ) : (
        Object.values(groups).map(group => {
          const { info, items } = group;
          return (
            <div key={`${info.evenement}__${info.date}`} className="space-y-4">
              {/* ─── Event header ─── */}
              <div className="flex items-center gap-4 mb-2">
                {info.logo_artiste && (
                  <div className="relative w-12 h-12">
                    <Image
                      src={`/images/artistes/${info.logo_artiste}`}
                      alt={info.evenement}
                      layout="fill"
                      objectFit="cover"
                      className="rounded-full border border-gray-700"
                    />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold">{info.evenement}</h2>
                  <p className="text-gray-300">
                    {format(new Date(info.date), 'EEEE d MMMM yyyy', {
                      locale: fr,
                    })}
                  </p>
                  <p className="text-gray-300">
                    {info.ville} – {info.pays}
                  </p>
                </div>
              </div>

              {/* ─── Tickets for this event ─── */}
              <div className="space-y-2">
                {items.map(item => (
                  <div
                    key={item.id_billet}
                    className="border border-gray-700 p-4 rounded-xl bg-gray-900 flex justify-between items-center"
                  >
                    <div>
                      <h3 className="font-semibold">{item.categorie}</h3>
                      <p className="text-gray-400 text-sm">
                        {item.prix} € × {item.quantite} billet
                        {item.quantite > 1 && 's'}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id_billet)}
                      className="text-red-400 hover:underline text-sm"
                      aria-label={`Retirer ${item.categorie}`}
                    >
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* ─── Total & checkout ─── */}
      {cart.length > 0 && (
        <div className="pt-6 border-t border-gray-700">
          <div className="text-right text-xl font-semibold">
            Total : {total} €
          </div>
          <div className="mt-4 text-right">
            <button
              onClick={checkout}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded font-semibold"
            >
              Payer maintenant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
