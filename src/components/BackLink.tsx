import React from 'react';
import { Link } from 'react-router-dom';

interface AsLinkProps {
  to: string;
  onClick?: never;
  children?: React.ReactNode;
}

interface AsButtonProps {
  onClick: () => void;
  to?: never;
  children?: React.ReactNode;
}

type BackLinkProps = AsLinkProps | AsButtonProps;

export default function BackLink({ to, onClick, children = '\u2190 Back' }: BackLinkProps): React.ReactElement {
  if (to !== undefined) {
    return (
      <Link to={to} className="usa-button usa-button--unstyled">
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="usa-button usa-button--unstyled" onClick={onClick}>
      {children}
    </button>
  );
}
