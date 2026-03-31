quiero que ñadamos unso cuantos casos al backend en payment order podria ir.

voy a tener los siguient casos de uso de l aplataforma:

1. servicio que sera para movimientos interbancarios
2. y otro que sera netamente para movimiento en mi wallet

en el primer caso se dividira en los siguientes casos de rutas:

enviar:
1.1. bolivia_to_world
1.2. wallet_to_wallet
1.3. bolivia_to_wallet

Depositar:
1.4. world_to_bolivia
1.5. world_to_wallet

----
2. movimientos de la wallet de bridge

rampa de acceso
2.1. fiat(bo) a wallet(bridge)
2.2. crypto(usdt) a wallet(bridge)
2.3. fiat(us) a wallet(bridge)

rampa de salida
2.4. wallet(bridge) a fiat(bo)
2.5. wallet(bridge) a crypto(usdt)
2.6. wallet(bridge) a fiat(us) 

ahora vamos a detallar cada uno de los casos de uso.

para los casos de movimientos bancarios tendrai los siguientes estados

created
waiting_deposit
deposit_received
processing
sent
completed
failed


1.1. bolivia_to_world
    este proceso se realizara de la siguiente manera:
    el usuario en el frontend ralizara una peticion de boliva al exterior
    entonces llenara el formulario correspondiente el cual tendra por ejemplo los campos de, el monto, y podra escoger el proveedor de servicio, claro antes de ello tendras que crear un proveedor en donde introduciras todos los datos de cuenta externa, tambien introeducire el motivo del pago ams un documeno de respaldo 

    en este apartado e el frotend me mostrara un campo de revision de mis datos y podre crear mi expediente en este caso el estado cambia a created

    y en este momento me msotrara la qr del PSAV o la cuenta bancaria del PSAV para que pueda realizar el deposito en esta paso el estado cambia a "waiting_deposit"

    cuando el usuario realice el deposito en el PSAV, en este caso el estado cambia a "deposit_received"

    aqui el staff o el damin toman el control ellos revisan los datos que subiste si todo esta bien y tambien el, fee, el monto total, el tipo de cambio, ellos lo dan por bueno y pasan al paso de processing

    aqui el PSAV realiza el deposito hacia la cuenta fiat(us) que el cliente aya añadido para el destino de su envio en el formulario, entonces una vez enviado añado el dato de hash y paso al estado "sent"

    y finalmente para pasar al estado de "completed" tengo que añadir el resivo de la factura del pago realizado

    si por alguna razon hay alguna observacion en lagunos de los pasos se le adiciona una notificacion al cliente y se pasa al estado de "failed"

1.2. wallet_to_wallet
    
    este proceso se realizara de la siguiente manera:
    el usuario en el frontend ralizara una peticion de wallet a wallet
    entonces llenara el formulario correspondiente el cual tendra por ejemplo los campos de, el monto, y podra escoger el proveedor de servicio, claro antes de ello tendras que crear un proveedor en donde introduciras todos los datos de cuenta dle wallet externa, tambien introeducire el motivo del pago ams un documeno de respaldo 

    en este apartado en el frotend me mostrara un campo de revision de mis datos y podre crear mi expediente en este caso el estado cambia a created 
    y aqui es donde entre bridge y me realiza un servicio de transfer de wallet externo a wallet externo para ello realizara una peticion y bridge me devolvera una instrucciones y en esta estara un objeto con el dato source_deposit_instructions donde estara la cuenta a la que devo realizar el deposito

    este momento me msotrara la instrucciones de deposito y el estado cambia a "waiting_deposit"

    cuando el usuario realice el deposito el estado cambia a "deposit_received"

    aqui el staff o el damin toman el control ellos revisan los datos que subiste si todo esta bien y tambien el, fee, el monto total, el tipo de cambio, ellos lo dan por bueno y pasan al paso de processing

    aqui el PSAV realiza el deposito hacia la cuenta wallet externa que el cliente aya añadido para el destino de su envio en el formulario, entonces una vez enviado, añado el dato de hash y paso al estado "sent"

    y finalmente para pasar al estado de "completed" tengo que añadir el resivo de la factura del pago realizado

    si por alguna razon hay alguna observacion en lagunos de los pasos se le adiciona una notificacion al cliente y se pasa al estado de "failed"



1.3. bolivia_to_wallet
    este proceso se realizara de la siguiente manera:
    el usuario en el frontend ralizara una peticion de boliva a wallet
    entonces llenara el formulario correspondiente el cual tendra por ejemplo los campos de, el monto, y podra escoger el proveedor de servicio, claro antes de ello tendras que crear un proveedor en donde introduciras todos los datos de cuenta dle wallet externa, tambien introeducire el motivo del pago ams un documeno de respaldo 

    en este apartado en el frotend me mostrara un campo de revision de mis datos y podre crear mi expediente en este caso el estado cambia a created

    y en este momento me msotrara la qr del PSAV o la cuenta bancaria del PSAV para que pueda realizar el deposito en esta paso el estado cambia a "waiting_deposit"

    cuando el usuario realice el deposito a el PSAV, en este caso el estado cambia a "deposit_received"

    aqui el staff o el damin toman el control ellos revisan los datos que subiste si todo esta bien y tambien el, fee, el monto total, el tipo de cambio, ellos lo dan por bueno y pasan al paso de processing

    aqui el PSAV realiza el deposito hacia la cuenta wallet externa que el cliente aya añadido para el destino de su envio en el formulario, entonces una vez enviado, añado el dato de hash y paso al estado "sent"

    y finalmente para pasar al estado de "completed" tengo que añadir el resivo de la factura del pago realizado

    si por alguna razon hay alguna observacion en lagunos de los pasos se le adiciona una notificacion al cliente y se pasa al estado de "failed"

1.4. world_to_bolivia
1.5. world_to_wallet
2.1. fiat(bo) a wallet(bridge)
2.2. crypto(usdt) a wallet(bridge)
2.3. fiat(us) a wallet(bridge)
2.4. wallet(bridge) a fiat(bo)
2.5. wallet(bridge) a crypto(usdt)
2.6. wallet(bridge) a fiat(us) 
