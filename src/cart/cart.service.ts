import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { Repository } from 'typeorm'
import { Product } from '../catalog/entities/product.entity'
import { AddCartItemDto } from './dto/add-cart-item.dto'
import { CartItem } from './entities/cart-item.entity'
import { Cart } from './entities/cart.entity'

const GUEST_TTL = 7 * 24 * 60 * 60

export interface CartItemResponse {
  productId: string
  quantity: number
  priceSnapshot: string
  product: {
    id: string
    sku: string
    title: string
    price: string
    stock: number
  }
}

export interface CartResponse {
  items: CartItemResponse[]
  totalItems: number
  totalPrice: string
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async getGuestCart(sessionId: string): Promise<CartResponse> {
    const data = await this.redis.hgetall(`cart:guest:${sessionId}`)
    return this.buildCartResponseFromMap(data)
  }

  async addGuestItem(sessionId: string, dto: AddCartItemDto): Promise<void> {
    const product = await this.validateProduct(dto.productId)
    if (product.stock <= 0) {
      throw new BadRequestException('Product is out of stock')
    }
    const key = `cart:guest:${sessionId}`
    await this.redis.hincrby(key, dto.productId, dto.quantity)
    await this.redis.expire(key, GUEST_TTL)
  }

  async updateGuestItem(
    sessionId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    const key = `cart:guest:${sessionId}`
    if (quantity === 0) {
      await this.redis.hdel(key, productId)
      return
    }
    await this.redis.hset(key, productId, quantity)
    await this.redis.expire(key, GUEST_TTL)
  }

  async removeGuestItem(sessionId: string, productId: string): Promise<void> {
    await this.redis.hdel(`cart:guest:${sessionId}`, productId)
  }

  async clearGuestCart(sessionId: string): Promise<void> {
    await this.redis.del(`cart:guest:${sessionId}`)
  }

  async getAuthCart(userId: string): Promise<CartResponse> {
    const cart = await this.getOrCreateCart(userId)
    return this.buildAuthCartResponse(cart)
  }

  async addAuthItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    const product = await this.validateProduct(dto.productId)
    if (product.stock <= 0) {
      throw new BadRequestException('Product is out of stock')
    }

    const cart = await this.getOrCreateCart(userId)
    const existing = cart.items.find(
      (item) => item.productId === dto.productId,
    )

    if (existing) {
      existing.quantity += dto.quantity
      await this.cartItemRepo.save(existing)
    } else {
      const item = this.cartItemRepo.create({
        cartId: cart.id,
        priceSnapshot: product.price,
        productId: dto.productId,
        quantity: dto.quantity,
      })
      await this.cartItemRepo.save(item)
    }

    const refreshed = await this.cartRepo.findOne({
      relations: { items: { product: true } },
      where: { id: cart.id },
    })
    return this.buildAuthCartResponse(refreshed!)
  }

  async updateAuthItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartResponse> {
    const cart = await this.findUserCart(userId)
    const item = cart.items.find((i) => i.productId === productId)
    if (!item) throw new NotFoundException('Cart item not found')

    if (quantity === 0) {
      await this.cartItemRepo.remove(item)
    } else {
      item.quantity = quantity
      await this.cartItemRepo.save(item)
    }

    const refreshed = await this.cartRepo.findOne({
      relations: { items: { product: true } },
      where: { id: cart.id },
    })
    return this.buildAuthCartResponse(refreshed!)
  }

  async removeAuthItem(
    userId: string,
    productId: string,
  ): Promise<CartResponse> {
    const cart = await this.findUserCart(userId)
    const item = cart.items.find((i) => i.productId === productId)
    if (!item) throw new NotFoundException('Cart item not found')

    await this.cartItemRepo.remove(item)

    const refreshed = await this.cartRepo.findOne({
      relations: { items: { product: true } },
      where: { id: cart.id },
    })
    return this.buildAuthCartResponse(refreshed!)
  }

  async clearAuthCart(userId: string): Promise<{ cleared: true }> {
    const cart = await this.findUserCart(userId)
    if (cart.items.length) {
      await this.cartItemRepo.remove(cart.items)
    }
    return { cleared: true }
  }

  async mergeGuestCart(userId: string, sessionId: string): Promise<void> {
    const data = await this.redis.hgetall(`cart:guest:${sessionId}`)
    if (!data || Object.keys(data).length === 0) return

    const cart = await this.getOrCreateCart(userId)

    for (const [productId, qtyStr] of Object.entries(data)) {
      const guestQty = Number.parseInt(qtyStr, 10)
      const product = await this.productRepo.findOne({
        where: { id: productId },
      })
      if (!product) continue

      const existing = cart.items.find(
        (item) => item.productId === productId,
      )
      if (existing) {
        existing.quantity = Math.max(guestQty, existing.quantity)
        await this.cartItemRepo.save(existing)
      } else {
        const item = this.cartItemRepo.create({
          cartId: cart.id,
          priceSnapshot: product.price,
          productId,
          quantity: guestQty,
        })
        await this.cartItemRepo.save(item)
      }
    }

    await this.redis.del(`cart:guest:${sessionId}`)
  }

  private async validateProduct(productId: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  private async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({
      relations: { items: { product: true } },
      where: { userId },
    })
    if (!cart) {
      cart = this.cartRepo.create({ items: [], userId })
      cart = await this.cartRepo.save(cart)
    }
    return cart
  }

  private async findUserCart(userId: string): Promise<Cart> {
    const cart = await this.cartRepo.findOne({
      relations: { items: { product: true } },
      where: { userId },
    })
    if (!cart) throw new NotFoundException('Cart not found')
    return cart
  }

  private async buildCartResponseFromMap(
    data: Record<string, string>,
  ): Promise<CartResponse> {
    const entries = Object.entries(data)
    if (entries.length === 0) {
      return { items: [], totalItems: 0, totalPrice: '0.00' }
    }

    const items: CartItemResponse[] = []
    let totalCents = 0
    let totalItems = 0

    for (const [productId, qtyStr] of entries) {
      const quantity = Number.parseInt(qtyStr, 10)
      const product = await this.productRepo.findOne({
        where: { id: productId },
      })
      if (!product) continue

      const priceCents = Math.round(
        Number.parseFloat(product.price) * 100,
      )
      totalCents += priceCents * quantity
      totalItems += quantity

      items.push({
        priceSnapshot: product.price,
        product: {
          id: product.id,
          price: product.price,
          sku: product.sku,
          stock: product.stock,
          title: product.title,
        },
        productId,
        quantity,
      })
    }

    const totalPrice = (totalCents / 100).toFixed(2)
    return { items, totalItems, totalPrice }
  }

  private buildAuthCartResponse(cart: Cart): CartResponse {
    const items: CartItemResponse[] = []
    let totalCents = 0
    let totalItems = 0

    for (const item of cart.items) {
      const priceCents = Math.round(
        Number.parseFloat(item.priceSnapshot) * 100,
      )
      totalCents += priceCents * item.quantity
      totalItems += item.quantity

      items.push({
        priceSnapshot: item.priceSnapshot,
        product: {
          id: item.product.id,
          price: item.product.price,
          sku: item.product.sku,
          stock: item.product.stock,
          title: item.product.title,
        },
        productId: item.productId,
        quantity: item.quantity,
      })
    }

    const totalPrice = (totalCents / 100).toFixed(2)
    return { items, totalItems, totalPrice }
  }
}
