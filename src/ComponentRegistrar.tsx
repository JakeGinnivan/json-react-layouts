import React from 'react'
import { Logger, noopLogger } from 'typescript-log'

import { DataDefinition, ComponentState, MaybeLoaded } from './DataLoading'
import { RouteBuilder } from './RouteBuilder'
import { ComponentProps } from './ComponentRenderer'

export interface ComponentRegistration<TType extends string, TProps extends {}, LoadDataServices> {
    type: TType
    render: RenderFunction<TProps, LoadDataServices>
    dataDefinition?: DataDefinition<any, any, LoadDataServices>
}

export function componentFactory<TLoadDataServices>() {
    return {
        /** Helper function to create the registration (to infer types) */
        createRegisterableComponent<TType extends string, TProps extends {}>(
            type: TType,
            render: RenderFunction<TProps, TLoadDataServices>,
        ): ComponentRegistration<TType, TProps, TLoadDataServices> {
            return { type, render }
        },

        /** Helper function to create the registration with data (to infer types) */
        createRegisterableComponentWithData<
            TType extends string,
            TProps extends {},
            TConfig extends {},
            TData
        >(
            type: TType,
            dataDefinition: DataDefinition<TConfig, TData, TLoadDataServices>,
            render: (
                props: TProps,
                dataProps: MaybeLoaded<TData> & { dataDefinitionArgs: TConfig },
                services: RenderFunctionServices<TLoadDataServices>,
            ) => React.ReactElement<any> | false | null,
        ): ComponentRegistration<
            TType,
            TProps & { dataDefinitionArgs: TConfig },
            TLoadDataServices
        > {
            // This is quite a complex transform which can't be modelled in typescript.
            //
            // The dataDefinition which is passed to this object is hidden from the types returned
            // The content area renderer has a data loader which will look for this property
            // Then use the loadData function
            const normalRender: RenderFunction<
                TProps & ComponentState<TData> & { dataDefinitionArgs: TConfig },
                TLoadDataServices
            > = ({ data, dataDefinitionArgs, ...rest }, services) => {
                return render(rest as any, { ...data, dataDefinitionArgs }, services)
            }

            const registrationWithData: any = { type, render: normalRender, dataDefinition }
            // Once the data is loaded it will be passed to the render function on the
            // data prop, which will be typed as LoadedData<TData>

            // The route info looks like this:
            // { type: TType, props: TProps & { dataDefinition: TData } }
            return registrationWithData
        },
    }
}

/** A component definition inside route definitions */
export interface ComponentInformation<TType, TProps = {}> {
    type: TType
    props: TProps
}

export interface RenderFunctionServices<LoadDataServices> {
    routeBuilder: RouteBuilder<any, any, any, any>
    loadDataServices: LoadDataServices
}

/** The render function for components, converts the route props into a react component */
export type RenderFunction<TProps, LoadDataServices> = (
    props: TProps,
    services: RenderFunctionServices<LoadDataServices>,
) => React.ReactElement<any> | false | null

// Collection of errors that can be thrown by the ComponentRegistrar
export const Errors = {
    missing: (component: string) => `Component '${component}' has not been registered`,
}

/**
 * Allows regisration of components to render in composition content areas in
 * a type safe way
 *
 * @example ComponentRegistrar.register(myComponentRegistration)
 */
export class ComponentRegistrar<
    TLoadDataServices extends {},
    TComponents extends ComponentInformation<any> = never,
    TMiddlewareProps extends object = {}
> {
    // the internal collection of registered components
    private registeredComponents: {
        [key: string]: ComponentRegistration<any, any, TLoadDataServices>
    } = {}
    private _componentMiddlewares: ComponentRendererMiddleware<
        TLoadDataServices,
        TMiddlewareProps
    >[] = []

    public get componentMiddleware(): ComponentRendererMiddleware<
        TLoadDataServices,
        TMiddlewareProps
    > {
        const pipeline = (
            props: ComponentProps,
            middlewareProps: TMiddlewareProps,
            services: RenderFunctionServices<TLoadDataServices>,
            ...steps: ComponentRendererMiddleware<TLoadDataServices, TMiddlewareProps>[]
        ): React.ReactElement<any> | false | null => {
            const [step, ...next] = steps
            return step
                ? step(props, middlewareProps, services, () =>
                      pipeline(props, middlewareProps, services, ...next),
                  )
                : null
        }

        return (props, middlewareProps, services, next) => {
            return pipeline(
                props,
                middlewareProps,
                services,
                ...this._componentMiddlewares,
                (cp, mp, s) => {
                    return next({ ...cp, ...mp }, s)
                },
            )
        }
    }

    constructor(public logger: Logger = noopLogger()) {}

    isRegistered = (type: TComponents['type']) => {
        return this.registeredComponents[type] !== undefined
    }

    /**
     * Returns the data definition for the given component
     */
    getDataDefinition = (type: TComponents['type']) => {
        const foundComponent = this.registeredComponents[type]
        if (!foundComponent) {
            return undefined
        }
        return foundComponent.dataDefinition
    }

    /**
     * expects the type from T to be passed in as a parameter, from this we
     * can retrieve the render function associated with the component
     */
    get = (type: TComponents['type']) => {
        const foundComponent = this.registeredComponents[type]
        if (!foundComponent && process.env.NODE_ENV !== 'production') {
            // continue rendering in production only. otherwise throw, this is so the site does not crash
            // empty area will be rendered instead
            this.logger.warn(Errors.missing(type))
        }
        return foundComponent
    }

    /** used to register another component using ComponentRegistration<TType, TProps> */
    register<TType extends string, TProps extends {}>(
        registration: ComponentRegistration<TType, TProps, TLoadDataServices>,
    ): ComponentRegistrar<
        TLoadDataServices,
        Exclude<TComponents, never> | ComponentInformation<TType, TProps>
    > {
        if (this.registeredComponents[registration.type]) {
            throw new Error(`${registration.type} has already been registered`)
        }

        this.registeredComponents[registration.type] = registration

        return this as any
    }

    registerMiddleware<TRegistrationMiddlewareProps extends object>(
        componentMiddleware: ComponentRendererMiddleware<
            TLoadDataServices,
            TRegistrationMiddlewareProps
        >,
    ): ComponentRegistrar<
        TLoadDataServices,
        TComponents,
        TMiddlewareProps & TRegistrationMiddlewareProps
    > {
        // This cast is safe because we are correctly typing the return type
        this._componentMiddlewares.push(componentMiddleware as any)

        return this as any
    }
}

export type ComponentRendererMiddleware<TLoadDataServices, TMiddlewareProps extends object> = (
    componentProps: ComponentProps,
    middlewareProps: TMiddlewareProps,
    services: RenderFunctionServices<TLoadDataServices>,
    next: RenderFunction<any, TLoadDataServices>,
) => React.ReactElement<any> | false | null
