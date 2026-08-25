import { useEffect, useState, useCallback } from 'react';

export function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  const query = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((v, k) => {
      query[k] = v;
    });
  }
  return { path, query };
}

export function navigate(to) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function Link({ to, className, children, ...rest }) {
  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      navigate(to);
    },
    [to]
  );
  return (
    <a href={`#${to}`} onClick={onClick} className={className} {...rest}>
      {children}
    </a>
  );
}
