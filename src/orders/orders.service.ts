// src/orders/orders.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { UserRole } from '../auth/entities/user-role.enum'
import { Cart } from '../cart/entities/cart.entity'
import { CartItem } from '../cart/entities/cart-item.entity'
import { Product } from '../catalog/entities/product.entity'
import type { ShippingAddressDto } from './dto/checkout.dto'
import { Order } from './entities/order.entity'
import { OrderItem } from './entities/order-item.entity'
import { OrderStatus } from './enum/order-status.enum'

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Pending]: [OrderStatus.Paid, OrderStatus.Cancelled],
  [OrderStatus.Paid]: [OrderStatus.Shipped, OrderStatus.Cancelled],
  [OrderStatus.Shipped]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
}

export interface OrderItemResponse {
  priceSnapshot: string
  product: { id: string; sku: string; title: string }
  productId: string
  quantity: number
}

export interface OrderResponse {
  createdAt: Date
  id: string
  idempotencyKey: string | null
  items: OrderItemResponse[]
  shippingAddress: Record<string, unknown>
  status: OrderStatus
  total: string
  updatedAt: Date
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) readonly _orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Product) readonly _productRepo: Repository<Product>,
    @InjectRepository(Cart) readonly _cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) readonly _cartItemRepo: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkout(
    userId: string,
    shippingAddress: ShippingAddressDto,
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    return await this.dataSource.transaction(async (em) => {
      // Step 1: Read cart with items
      const cart = await em.findOne(Cart, {
        relations: ['items', 'items.product'],
        where: { userId },
      })

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty')
      }

      const cartItems = cart.items

      // Step 2: Lock product rows (SELECT FOR UPDATE)
      const productIds = cartItems.map((item) => item.productId)
      const products: { id: string; stock: number }[] = await em.query(
        'SELECT id, stock FROM products WHERE id = ANY($1) FOR UPDATE',
        [productIds],
      )
      const productMap = new Map(products.map((p) => [p.id, p.stock] as const))

      // Step 3: Validate stock
      const insufficient = cartItems.filter(
        (item) => (productMap.get(item.productId) ?? 0) < item.quantity,
      )
      if (insufficient.length > 0) {
        throw new BadRequestException(
          `Insufficient stock for products: ${insufficient.map((i) => i.productId).join(', ')}`,
        )
      }

      // Step 4: Decrement stock atomically
      for (const item of cartItems) {
        await em.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
          [item.quantity, item.productId],
        )
      }

      // Step 5: Calculate total
      let totalCents = 0
      for (const item of cartItems) {
        totalCents +=
          Math.round(Number.parseFloat(item.priceSnapshot) * 100) *
          item.quantity
      }
      const total = (totalCents / 100).toFixed(2)

      // Step 6: Create order + order_items
      const order = em.create(Order, {
        idempotencyKey: idempotencyKey ?? null,
        shippingAddress: shippingAddress as unknown as Record<string, unknown>,
        status: OrderStatus.Pending,
        total,
        userId,
      } as Partial<Order>)
      const savedOrder = await em.save(Order, order)

      const orderItems = cartItems.map((item) =>
        em.create(OrderItem, {
          orderId: savedOrder.id,
          priceSnapshot: item.priceSnapshot,
          productId: item.productId,
          quantity: item.quantity,
        } as Partial<OrderItem>),
      )
      await em.save(OrderItem, orderItems)

      // Step 7: Delete cart items
      await em.delete(CartItem, { cartId: cart.id })

      this.eventEmitter.emit('order.created', {
        orderId: savedOrder.id,
        total,
        userId,
      })

      return this.buildResponse({ ...savedOrder, items: orderItems } as Order)
    })
  }

  async findAll(
    query: { page?: number; limit?: number },
    requesterId: string,
    requesterRole: string,
  ) {
    const { page = 1, limit = 20 } = query
    const targetUserId =
      requesterRole === UserRole.ADMIN ? undefined : requesterId

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.product', 'product')

    if (targetUserId) {
      qb.andWhere('order.userId = :userId', { userId: targetUserId })
    }

    qb.orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)

    const [data, total] = await qb.getManyAndCount()

    return {
      data: data.map((o) => this.buildResponse(o)),
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(orderId: string): Promise<OrderResponse> {
    const order = await this.orderRepo.findOne({
      relations: ['items', 'items.product'],
      where: { id: orderId },
    })
    if (!order) throw new NotFoundException('Order not found')
    return this.buildResponse(order)
  }

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    adminId: string,
  ): Promise<OrderResponse> {
    const order = await this.orderRepo.findOne({
      relations: ['items'],
      where: { id: orderId },
    })
    if (!order) throw new NotFoundException('Order not found')

    const allowed = ALLOWED_TRANSITIONS[order.status]
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${newStatus}`,
      )
    }

    order.status = newStatus
    const saved = await this.orderRepo.save(order)

    const eventMap: Record<string, string> = {
      [OrderStatus.Paid]: 'order.paid',
      [OrderStatus.Shipped]: 'order.shipped',
      [OrderStatus.Delivered]: 'order.delivered',
    }
    const event = eventMap[newStatus]
    if (event) {
      this.eventEmitter.emit(event, { orderId: saved.id, userId: saved.userId })
    }

    return this.buildResponse(saved)
  }

  async cancel(
    orderId: string,
    requesterId: string,
    requesterRole: string,
    reason?: string,
  ): Promise<OrderResponse> {
    const order = await this.orderRepo.findOne({
      relations: ['items'],
      where: { id: orderId },
    })
    if (!order) throw new NotFoundException('Order not found')

    // Authorization: owner can cancel pending, admin can cancel pending + paid
    if (requesterRole !== UserRole.ADMIN) {
      if (order.userId !== requesterId) {
        throw new ForbiddenException('Not your order')
      }
      if (order.status !== OrderStatus.Pending) {
        throw new BadRequestException('Only pending orders can be cancelled')
      }
    } else {
      if (
        order.status !== OrderStatus.Pending &&
        order.status !== OrderStatus.Paid
      ) {
        throw new BadRequestException(
          'Only pending or paid orders can be cancelled',
        )
      }
    }

    return await this.dataSource.transaction(async (em) => {
      // Return stock
      for (const item of order.items) {
        await em.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [
          item.quantity,
          item.productId,
        ])
      }

      order.status = OrderStatus.Cancelled
      const saved = await em.save(Order, order)

      this.eventEmitter.emit('order.cancelled', {
        orderId: saved.id,
        reason,
        userId: saved.userId,
      })

      return this.buildResponse(saved)
    })
  }

  private buildResponse(order: Order): OrderResponse {
    return {
      createdAt: order.createdAt,
      id: order.id,
      idempotencyKey: order.idempotencyKey,
      items:
        order.items?.map((item) => ({
          priceSnapshot: item.priceSnapshot,
          product: {
            id: item.product?.id ?? item.productId,
            sku: item.product?.sku ?? '',
            title: item.product?.title ?? '',
          },
          productId: item.productId,
          quantity: item.quantity,
        })) ?? [],
      shippingAddress: order.shippingAddress,
      status: order.status,
      total: order.total,
      updatedAt: order.updatedAt,
    }
  }
}
