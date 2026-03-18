// pages/panier.tsx
import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '@/context/cartContext'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Header from '@/components/Header'

export default function PanierPage() {
  const { cart, removeFromCart } = useCart()

  const total = cart.reduce((acc, item) => {
    if (item.adult_qty != null && item.child_qty != null && item.prix_adult != null && item.prix_child != null) {
      return acc + item.adult_qty * item.prix_adult + item.child_qty * item.prix_child
    }
    return acc + item.prix * item.quantite
  }, 0)

  type CartItem = typeof cart[number]
  type Group = { info: CartItem; items: CartItem[] }
  const groups: Record<string, Group> = cart.reduce((acc, item) => {
    const key = `${item.evenement}__${item.date}`
    if (!acc[key]) acc[key] = { info: item, items: [] }
    acc[key].items.push(item)
    return acc
  }, {} as Record<string, Group>)

  const checkout = async () => {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.map(i => ({
        billet_id: i.id_billet,
        quantity: i.quantite,
        ...(i.adult_qty != null ? { adult_qty: i.adult_qty, child_qty: i.child_qty } : {}),
      })) }),
    })
    const data = await res.json()
    if (data?.url) {
      window.location.href = data.url
    } else {
      alert('Erreur lors de la création de la session de paiement.')
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Header />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1
          className="text-3xl font-semibold text-[#111111] mb-8"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          Ton panier
        </h1>

        {cart.length === 0 ? (
          <div className="bg-white border border-[#E5E5E0] rounded-xl p-12 text-center">
            <p className="text-gray-400 mb-6">Ton panier est vide.</p>
            <Link
              href="/"
              className="inline-block bg-[#1a3a2a] text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-[#15302a] transition-colors"
            >
              Voir les événements
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.values(groups).map(group => {
              const { info, items } = group
              return (
                <div key={`${info.evenement}__${info.date}`} className="bg-white border border-[#E5E5E0] rounded-xl overflow-hidden">
                  {/* Event header */}
                  <div className="flex items-center gap-4 p-5 border-b border-[#E5E5E0]">
                    {(info.image || info.logo_artiste) && (
                      <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden">
                        <Image
                          src={info.image ? `/images/events/${info.image}` : `/images/artistes/${info.logo_artiste}`}
                          alt={info.evenement}
                          layout="fill"
                          objectFit="cover"
                        />
                      </div>
                    )}
                    <div>
                      <h2
                        className="text-xl font-semibold text-[#111111]"
                        style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                      >
                        {info.evenement}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {format(new Date(info.date), 'EEEE d MMMM yyyy', { locale: fr })}
                      </p>
                      {info.ville && (
                        <p className="text-sm text-gray-400">{info.ville}{info.pays ? ` — ${info.pays}` : ''}</p>
                      )}
                    </div>
                  </div>

                  {/* Ticket rows */}
                  <div className="divide-y divide-[#E5E5E0]">
                    {items.map(item => (
                      <div key={item.id_billet} className="flex justify-between items-center px-5 py-3">
                        <div>
                          <p className="font-medium text-[#111111] text-sm">{item.categorie}</p>
                          {item.adult_qty != null && item.child_qty != null && item.prix_adult != null && item.prix_child != null ? (
                            <div className="text-sm text-gray-500">
                              {item.adult_qty > 0 && (
                                <p>{item.prix_adult} € × {item.adult_qty} adulte{item.adult_qty > 1 ? 's' : ''}</p>
                              )}
                              {item.child_qty > 0 && (
                                <p>{item.prix_child} € × {item.child_qty} enfant{item.child_qty > 1 ? 's' : ''}</p>
                              )}
                              <span className="font-medium text-[#111111]">
                                = {(item.adult_qty * item.prix_adult + item.child_qty * item.prix_child).toFixed(2)} €
                              </span>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">
                              {item.prix} € × {item.quantite} billet{item.quantite > 1 ? 's' : ''}
                              <span className="ml-2 font-medium text-[#111111]">
                                = {(item.prix * item.quantite).toFixed(2)} €
                              </span>
                            </p>
                          )}
                          {item.extra_info && (
                            <p className="text-xs text-gray-400 italic mt-0.5">{item.extra_info}</p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id_billet)}
                          className="text-sm text-red-400 hover:text-red-600 transition-colors ml-4"
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Total + checkout */}
            <div className="bg-white border border-[#E5E5E0] rounded-xl p-5">
              <div className="border-t border-[#E5E5E0] mt-4 pt-4">
                <div className="flex justify-between items-center mb-5">
                  <span className="text-sm text-gray-500 font-medium uppercase tracking-wide">Total</span>
                  <span
                    className="text-2xl font-semibold text-[#111111]"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                  >
                    {total.toFixed(2)} €
                  </span>
                </div>
                <button
                  onClick={checkout}
                  className="w-full bg-[#1a3a2a] hover:bg-[#15302a] text-white py-3.5 rounded-md font-medium text-sm transition-colors"
                >
                  Payer maintenant
                </button>
              </div>
            </div>

            {/* Contact link */}
            <p className="text-center text-sm text-gray-400 pt-2">
              Une question ?{' '}
              <Link href="/contact" className="text-[#1a3a2a] font-medium hover:underline">
                Contactez-nous
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
