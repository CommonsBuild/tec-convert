import React, { useState, useEffect, useCallback } from 'react'
import {
  useMakeOrder,
  useApprove,
  useAllowance,
  useOrderReceiptAmount,
} from 'lib/web3-contracts'
import { bigNum } from 'lib/utils'
import ConvertSteps from 'components/ConvertSteps/ConvertSteps'
import FullPageLoader from "../FullPageLoader"

function ManageConversion({ toBonded, fromAmount, handleReturnHome, minReturn }) {
  const makeOrder = useMakeOrder()
  const orderReceiptAmount = useOrderReceiptAmount()
  const changeAllowance = useApprove()
  const getAllowance = useAllowance()
  const [conversionSteps, setConversionSteps] = useState([])
  const [convertedTotal, setConvertedTotal] = useState(bigNum(-1))

  const updateConvertedValue = useCallback(
    async hash => {
      try {
        const amount = await orderReceiptAmount(hash)

        setConvertedTotal(amount)
      } catch (err) {
        throw new Error(err)
      }
    },
    [orderReceiptAmount]
  )

  useEffect(() => {
    let cancelled = false

    // Interacting with the bonding curve involves 1, 2 or 3 transactions (depending on the direction and state of allowance):
    // 1. Reset approval (If we're converting ANT -> ANJ, an allowance was previously set but abandoned)
    // 2. Raise approval (If we're converting ANT -> ANJ, the current allowance is not high enough)
    // 3. Make an order
    const createConvertSteps = async () => {
      let steps = []

      // First we check for allowance if the direction is ANT -> ANJ
      if (toBonded) {
        const allowance = await getAllowance()

        // and if we need more, add a step to ask for an approval
        if (allowance.lt(bigNum(fromAmount))) {
          steps.unshift([
            'Raise approval',
            {
              onTxCreated: () => changeAllowance(fromAmount),
            },
          ])

          // Then there's the case when a user has an allowance set to the bonding curve contract
          // but wants to convert even more tokens this time. When dealing with this case
          // we want to first prepend a transaction to reset the allowance back to zero
          // (before raising it in the next transaction from above).
          if (!allowance.isZero()) {
            steps.unshift([
              'Reset approval',
              {
                onTxCreated: () => changeAllowance(0),
              },
            ])
          }
        }
      }

      // Next add the order
      steps.push([
        `Make ${toBonded ? 'buy' : 'sell'} order`,
        {
          onTxCreated: () => makeOrder(fromAmount, toBonded, minReturn),
          onTxMined: hash => updateConvertedValue(hash),
        },
      ])

      // Update state to reflect the correct amount of steps
      // Show loader for a small amount of time to provide a smooth visual experience
      setTimeout(() => {
        if (!cancelled) {
          setConversionSteps(steps)
        }
      }, 900)
    }

    createConvertSteps()

    return () => {
      cancelled = true
    }
  }, [
    changeAllowance,
    fromAmount,
    getAllowance,
    makeOrder,
    toBonded,
    updateConvertedValue,
    minReturn,
  ])

  return (
    <>
      {conversionSteps.length > 0 ? (
        <ConvertSteps
          steps={conversionSteps}
          toBonded={toBonded}
          fromAmount={fromAmount}
          convertedTotal={convertedTotal}
          onReturnHome={handleReturnHome}
        />
      ) : (
        <div
          css={`
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100vw;
            height: 100vh;
          `}
        >
          <FullPageLoader />
        </div>
      )}
    </>
  )
}

export default ManageConversion
